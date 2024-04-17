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

const firebaseConfig = {
  apiKey: "AIzaSyD_F2QU9kOyUxt83o7ntZiWNVkyFdJDjbM",
  authDomain: "webrtc-video-conferencin-a2abe.firebaseapp.com",
  projectId: "webrtc-video-conferencin-a2abe",
  storageBucket: "webrtc-video-conferencin-a2abe.appspot.com",
  messagingSenderId: "735538910791",
  appId: "1:735538910791:web:9f9625ed11fa29e9a50362",
  measurementId: "G-F55B7DMZK6"
};

initializeApp(firebaseConfig);
const firestore = getFirestore();
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

let superResolutionSession = new InferenceSession();
superResolutionSession.loadModel('./super-resolution-10.onnx').catch(console.error);

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

async function main() {
  await ensureOpenCvLoaded();

  const cv = window.cv;
  const webcamButton = document.getElementById('webcamButton');
  const webcamVideo = document.getElementById('webcamVideo');
  const callButton = document.getElementById('callButton');
  const callInput = document.getElementById('callInput');
  const answerButton = document.getElementById('answerButton');
  const remoteVideo = document.getElementById('remoteVideo');
  const hangupButton = document.getElementById('hangupButton');

  async function enhanceVideoFrame() {
    if (!remoteVideo.videoWidth || !remoteVideo.videoHeight) {
      console.error("Video stream not ready");
      return;
    }

    console.log("Enhancing Video Frame...");

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = remoteVideo.videoWidth;
    canvas.height = remoteVideo.videoHeight;

    context.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
    let src = cv.imread(canvas);
    let ycrcb = new cv.Mat();
    cv.cvtColor(src, ycrcb, cv.COLOR_RGBA2YCrCb);

    let channels = new cv.MatVector();
    cv.split(ycrcb, channels);
    let Y = channels.get(0);

    try {
      const inputTensor = new Tensor(new Float32Array(Y.data), 'float32', [1, 1, Y.rows, Y.cols]);
      console.log("Tensor prepared for model input");
      const outputs = await superResolutionSession.run({ input: inputTensor });
      const outputTensor = outputs.values().next().value;
      console.log("Model output received");

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

      cv.cvtColor(merged, src, cv.COLOR_YCrCb2RGBA);
      cv.imshow(canvas, src);

      remoteVideo.srcObject = canvas.captureStream();

      // Clean up
      src.delete(); ycrcb.delete(); Y.delete(); upscaledY.delete(); upscaledCrCb.delete(); merged.delete(); newChannels.delete();
    } catch (error) {
      console.error("Error during enhancement: ", error);
    }
  }

  setInterval(enhanceVideoFrame, 1000 / 30);

  webcamButton.onclick = async () => {
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
    webcamVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
      }
      event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
      remoteVideo.srcObject = remoteStream;
    };
    callButton.disabled = false;
    webcamButton.disabled = true;
  };

  callButton.onclick = async () => {
    const callDoc = doc(callsCollection);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    pc.onicecandidate = event => {
      if (event.candidate) {
        addDoc(offerCandidates, event.candidate.toJSON());
      }
    };
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);
    await setDoc(callDoc, { offer: offerDescription.toJSON() });
    callInput.value = callDoc.id;
    answerButton.disabled = false;
    hangupButton.disabled = false;
  };

  answerButton.onclick = async () => {
    const callDoc = doc(callsCollection, callInput.value);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    pc.onicecandidate = event => {
      if (event.candidate) {
        addDoc(answerCandidates, event.candidate.toJSON());
      }
    };
    const callSnapshot = await getDoc(callDoc);
    const callData = callSnapshot.data();
    const offerDescription = new RTCSessionDescription(callData.offer);
    await pc.setRemoteDescription(offerDescription);
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);
    await updateDoc(callDoc, { answer: answerDescription.toJSON() });
    callButton.disabled = true;
  };

  hangupButton.onclick = async () => {
    pc.close();
    localStream.getTracks().forEach(track => track.stop());
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
    }
    await updateDoc(doc(callsCollection, callInput.value), { callEnded: true });
    webcamButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
    hangupButton.disabled = true;
    callInput.value = '';
    pc = new RTCPeerConnection(servers); // reset the peer connection
  };
}

main().catch(console.error);
