import * as tf from '@tensorflow/tfjs';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.min.js';
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
import './style.css';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD_F2QU9kOyUxt83o7ntZiWNVkyFdJDjbM",
  authDomain: "webrtc-video-conferencin-a2abe.firebaseapp.com",
  projectId: "webrtc-video-conferencin-a2abe",
  storageBucket: "webrtc-video-conferencin-a2abe.appspot.com",
  messagingSenderId: "735538910791",
  appId: "1:735538910791:web:9f9625ed11fa29e9a50362",
  measurementId: "G-F55B7DMZK6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const callsCollection = collection(firestore, 'calls');

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
  sctp: true,
};

// Global State
let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
let superResolutionModel = null;

async function loadSuperResolutionModel() {
  superResolutionModel = await tf.loadGraphModel('https://firebasestorage.googleapis.com/v0/b/webrtc-video-conferencin-a2abe.appspot.com/o/model.json?alt=media&token=934547c1-af29-4dfc-8dad-a4b5cee34464');
}
loadSuperResolutionModel();

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
    const incomingStream = event.streams[0];

    incomingStream.getTracks().forEach((track) => {
      if (track.kind === 'video' && superResolutionModel) {
        // Create an offscreen video element to play the original track
        const originalVideo = document.createElement('video');
        originalVideo.autoplay = true;
        originalVideo.playsInline = true;
        originalVideo.srcObject = new MediaStream([track]);

        originalVideo.onloadedmetadata = async () => {
          // Make sure the video is played after metadata is loaded
          await originalVideo.play();

          const tensor = tf.browser.fromPixels(originalVideo).toFloat().div(tf.scalar(255));

          // Adjust to channels-first ordering
          const reordered = tensor.transpose([2, 0, 1]);

          const batched = reordered.reshape([1, 3, originalVideo.videoHeight, originalVideo.videoWidth]);

          const output = superResolutionModel.predict({ input: batched }); // ensure input name matches model's expected input tensor name

          const outputVideo = document.createElement('video');
          outputVideo.autoplay = true;
          outputVideo.playsInline = true;
          outputVideo.srcObject = new MediaStream([tf.browser.toPixels(output.squeeze()).captureStream().getVideoTracks()[0]]);

          remoteStream.addTrack(outputVideo.captureStream().getVideoTracks()[0]);
        };

      } else {
        remoteStream.addTrack(track);
      }
    });
  };


  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  // Enable/disable respective buttons
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
});


callButton.addEventListener('click', async () => {
  const callDoc = doc(callsCollection);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates');

  callInput.value = callDoc.id;

  pc.onicecandidate = async (event) => {
    event.candidate && await addDoc(offerCandidates, event.candidate.toJSON());
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };
  await setDoc(callDoc, { offer });
  onSnapshot(doc(firestore, 'calls', callDoc.id), (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });
  onSnapshot(collection(doc(firestore, 'calls', callDoc.id), 'answerCandidates'), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
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

  pc.onicecandidate = async (event) => {
    event.candidate && await addDoc(answerCandidates, event.candidate.toJSON());
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
  onSnapshot(collection(callDoc, 'offerCandidates'), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        let data = change.doc.data();
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

  // Reset the UI state
  hangupButton.disabled = true;
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = false;
  callInput.value = '';

  // Gracefully reset the peer connection
  pc = new RTCPeerConnection(servers);
}

hangupButton.addEventListener('click', hangupCall);

// Listen for Call Termination on both sides (caller and recipient)
function monitorCallEnd() {
  const callId = callInput.value;
  const callDoc = doc(callsCollection, callId);
  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (data?.callEnded) {
      hangupCall();
    }
  });
}

// Add call monitoring immediately after setting up the call or answering
callButton.addEventListener('click', monitorCallEnd);
answerButton.addEventListener('click', monitorCallEnd);