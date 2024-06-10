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
  model = await tf.loadGraphModel('model/model.json');
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
const processedVideoCanvas = document.getElementById('processedVideoCanvas');
const ctx = processedVideoCanvas.getContext('2d');

async function enhanceVideoFrame() {
  if (!model || !remoteVideo || remoteVideo.readyState < 2) {
    return;
  }
  if (!remoteVideo.videoWidth || !remoteVideo.videoHeight) {
    console.error('Video dimensions not ready');
    return;
  }

  tf.engine().startScope();

  const canvas = document.createElement('canvas');
  canvas.width = remoteVideo.videoWidth;
  canvas.height = remoteVideo.videoHeight;
  const tempCtx = canvas.getContext('2d');
  tempCtx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);

  const tensor = tf.browser.fromPixels(canvas).toFloat().div(tf.scalar(255.0));

  let [R, G, B] = tf.split(tensor, 3, 2);
  let Y = R.mul(0.299).add(G.mul(0.587)).add(B.mul(0.114));
  let Cr = R.sub(Y).mul(0.713).add(0.5);
  let Cb = B.sub(Y).mul(0.564).add(0.5);

  Y = Y.expandDims(0);
  Y = tf.image.resizeBilinear(Y, [240, 480]);
  Y = Y.transpose([0, 3, 1, 2]);
  const outputTensor = await model.predict(Y);

  Cr = Cr.resizeBilinear([outputTensor.shape[2], outputTensor.shape[3]]).expandDims(0).transpose([0, 3, 1, 2]);
  Cb = Cb.resizeBilinear([outputTensor.shape[2], outputTensor.shape[3]]).expandDims(0).transpose([0, 3, 1, 2]);

  let YCrCbUpscaled = tf.concat([outputTensor, Cr, Cb], 1);
  const RGBUpscaled = tf.tidy(() => {
    const Y = YCrCbUpscaled.slice([0, 0, 0, 0], [-1, 1, -1, -1]).squeeze();
    const Cr = YCrCbUpscaled.slice([0, 1, 0, 0], [-1, 1, -1, -1]).squeeze();
    const Cb = YCrCbUpscaled.slice([0, 2, 0, 0], [-1, 1, -1, -1]).squeeze();

    const R = Y.add(Cr.sub(0.5).mul(1.403));
    const G = Y.sub(Cr.sub(0.5).mul(0.344)).sub(Cb.sub(0.5).mul(0.714));
    const B = Y.add(Cb.sub(0.5).mul(1.773));
    return tf.stack([R, G, B], 2).clipByValue(0, 1);
  });

  await tf.browser.toPixels(RGBUpscaled, processedVideoCanvas); // Render onto the visible canvas instead of the hidden video

  // Dispose of tensors
  tensor.dispose();
  R.dispose();
  G.dispose();
  B.dispose();
  Y.dispose();
  Cr.dispose();
  Cb.dispose();
  outputTensor.dispose();
  YCrCbUpscaled.dispose();
  RGBUpscaled.dispose();
  tf.engine().endScope();
}

let enhancementInterval = setInterval(enhanceVideoFrame, 1000 / 24); // Adjusted FPS for smoother performance

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
  if (enhancementInterval) {
    clearInterval(enhancementInterval); // This will stop the video frame enhancement
  }
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
