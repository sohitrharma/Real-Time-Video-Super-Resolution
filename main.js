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
import { InferenceSession, Tensor } from 'onnxjs';

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

let superResolutionSession;

async function loadSuperResolutionModel() {
  superResolutionSession = new InferenceSession();
  await superResolutionSession.loadModel('./super-resolution-10.onnx');
}

loadSuperResolutionModel();

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

function ensureOpenCvLoaded() {
  return new Promise((resolve, reject) => {
    const checkOpenCv = () => {
      if (window.cv && window.cv.imread) {
        console.log('OpenCV is ready.');
        resolve();
      } else {
        console.log('Waiting for OpenCV...');
        setTimeout(checkOpenCv, 100);
      }
    };
    checkOpenCv();
  });
}
await ensureOpenCvLoaded();

async function enhanceVideoFrame() {
  const remoteVideo = document.getElementById('remoteVideo');
  if (!remoteVideo.videoWidth || !remoteVideo.videoHeight) {
    console.error("Video dimensions not ready");
    return;
  }

  if (remoteVideo.readyState < 2) {
    console.error("Video is not ready for playing");
    return;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = remoteVideo.videoWidth;
  canvas.height = remoteVideo.videoHeight;

  context.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);

  let src = cv.imread(canvas);
  let ycrcb = new cv.Mat();
  try {
    cv.cvtColor(src, ycrcb, cv.COLOR_RGB2YCrCb);
  } catch (error) {
    console.error("Error converting color:", error);
    src.delete(); // Always clean up
    return;
  }

  let channels = new cv.MatVector();
  cv.split(ycrcb, channels);
  let Y = channels.get(0);

  if (!Y || Y.empty()) {
    console.error("Y channel is undefined or empty");
    src.delete();
    ycrcb.delete();
    channels.delete();
    return;
  }
  if (Y.type() !== cv.CV_32F) {
    let Y_float = new cv.Mat();
    Y.convertTo(Y_float, cv.CV_32F);
    Y.delete();  // Delete the old Y
    Y = Y_float; // Use the new converted Mat
  }
  try {
    let numElements = Y.rows * Y.cols;
    let Y_array = new Float32Array(Y.data32F);
    const inputTensor = new Tensor(Y_array, 'float32', [1, 1, Y.rows, Y.cols]);
    const outputs = await superResolutionSession.run({ input: inputTensor });
    const outputTensor = outputs.values().next().value;

    if (!outputTensor || !outputTensor.data) {
      console.error("outputTensor or outputTensor.data is undefined");
      throw new Error("Invalid output tensor data");
    }

    let upscaledY = cv.matFromArray(Y.rows, Y.cols, cv.CV_8UC1, outputTensor.data);
    let upscaledCrCb = new cv.Mat();
    cv.resize(channels.get(1), upscaledCrCb, new cv.Size(upscaledY.cols, upscaledY.rows), 0, 0, cv.INTER_CUBIC);
    cv.resize(channels.get(2), upscaledCrCb, new cv.Size(upscaledY.cols, upscaledY.rows), 0, 0, cv.INTER_CUBIC);

    let merged = new cv.Mat();
    let newChannels = new cv.MatVector();
    newChannels.push_back(upscaledY);
    newChannels.push_back(upscaledCrCb);
    newChannels.push_back(upscaledCrCb);
    cv.merge(newChannels, merged);

    cv.cvtColor(merged, src, cv.COLOR_YCrCb2RGB);
    cv.imshow(canvas, src);

    remoteVideo.srcObject = canvas.captureStream();

    src.delete(); ycrcb.delete(); Y.delete(); upscaledY.delete(); upscaledCrCb.delete(); merged.delete(); newChannels.delete();
  } catch (error) {
    console.error("Error during enhancement: ", error);
    src.delete();
    ycrcb.delete();
    if (Y) Y.delete();
  }
}






setInterval(enhanceVideoFrame, 1000 / 30);


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
