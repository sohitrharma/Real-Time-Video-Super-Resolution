import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.min.js';
import './style.css';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.4.0/firebase-app.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/9.4.0/firebase-firestore.js';
// import { InferenceSession, Tensor } from 'onnxjs';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD_F2QU9kOyUxt83o7ntZiWNVkyFdJDjbM",
  authDomain: "webrtc-video-conferencin-a2abe.firebaseapp.com",
  projectId: "webrtc-video-conferencin-a2abe",
  storageBucket: "webrtc-video-conferencin-a2abe.appspot.com",
  messagingSenderId: "735538910791",
  appId: "1:735538910791:web:9f9625ed11fa29e9a50362",
  measurementId: "G-F55B7DMZK6"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const callsCollection = collection(firestore, 'calls');

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
  sctp: true,
};

let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

let model;

async function loadSuperResolutionModel() {
  console.log('Loading the model...');
  model = await tf.loadGraphModel('/model.json');
  console.log('Model loaded successfully.');
}

tf.setBackend('webgl').then(() => {
  console.log('Using WebGL Backend:', tf.getBackend());
  // Now you can run your model and the operations will be executed on the GPU.
  loadSuperResolutionModel();
});

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

const canvas = document.createElement('canvas');
const worker = new Worker('worker.js');
worker.postMessage({ type: 'loadModel', modelUrl: '/model.json' });

worker.addEventListener('message', (event) => {
  if (event.data.type === 'modelLoaded') {
    console.log('Model loaded in worker');
  } else if (event.data.type === 'frameEnhanced') {
    const { outputTensor } = event.data;
    // Render the output tensor to the canvas
    tf.browser.toPixels(outputTensor, canvas);
    // Update the video track in the existing remoteStream
    const [videoTrack] = remoteStream.getVideoTracks();
    videoTrack.replaceTrack(canvas.captureStream().getVideoTracks()[0]);
    // Dispose of the tensor
    outputTensor.dispose();
    console.log('Frame enhancement completed and rendered');
  }
});

async function enhanceVideoFrame() {
  if (!remoteVideo || remoteVideo.readyState < 2) {
    console.error('Video not ready');
    return;
  }

  if (!remoteVideo.videoWidth || !remoteVideo.videoHeight) {
    console.error('Video dimensions not available');
    return;
  }

  canvas.width = remoteVideo.videoWidth;
  canvas.height = remoteVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);

  const tensor = tf.browser.fromPixels(canvas).toFloat().div(tf.scalar(255.0));
  // Send tensor data and shape
  worker.postMessage({
    type: 'enhanceFrame',
    tensor: { data: tensor.dataSync(), shape: tensor.shape }
  });
  tensor.dispose();
}

setInterval(enhanceVideoFrame, 1000); // Running at 10 FPS for performance reasons

webcamButton.addEventListener('click', async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      latency: 0.010,
      channelCount: 2,
      sampleRate: 48000,
      sampleSize: 16,
      volume: 1.0
    }
  });
  remoteStream = new MediaStream();
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };
  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
});
callButton.addEventListener('click', async () => {
  const callDoc = doc(callsCollection);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  callInput.value = callDoc.id;

  pc.onicecandidate = event => {
    if (event.candidate) {
      addDoc(offerCandidates, event.candidate.toJSON());
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };
  await setDoc(callDoc, { offer });

  onSnapshot(doc(firestore, 'calls', callDoc.id), snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  onSnapshot(collection(doc(firestore, 'calls', callDoc.id), 'answerCandidates'), snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
});

answerButton.addEventListener('click', async () => {
  const callId = callInput.value;
  const callDoc = doc(callsCollection, callId);
  const answerCandidates = collection(callDoc, 'answerCandidates');
  const offerCandidates = collection(callDoc, 'offerCandidates');

  pc.onicecandidate = event => {
    if (event.candidate) {
      addDoc(answerCandidates, event.candidate.toJSON());
    }
  };

  const callData = (await getDoc(callDoc)).data();
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };
  await updateDoc(callDoc, { answer });

  onSnapshot(collection(callDoc, 'offerCandidates'), snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
});

async function hangupCall() {
  pc.close();
  localStream.getTracks().forEach(track => track.stop());
  remoteStream.getTracks().forEach(track => track.stop());
  const callId = callInput.value;
  const callDoc = doc(callsCollection, callId);
  await updateDoc(callDoc, { callEnded: true });

  hangupButton.disabled = true;
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = false;
  callInput.value = '';

  pc = new RTCPeerConnection(servers);
}

hangupButton.addEventListener('click', hangupCall);

function monitorCallEnd() {
  const callId = callInput.value;
  const callDoc = doc(callsCollection, callId);
  onSnapshot(callDoc, snapshot => {
    const data = snapshot.data();
    if (data?.callEnded) {
      hangupCall();
    }
  });
}

callButton.addEventListener('click', monitorCallEnd);
answerButton.addEventListener('click', monitorCallEnd);
