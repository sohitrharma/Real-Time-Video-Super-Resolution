# Enhanced Video Conferencing App

A cutting-edge video conferencing application leveraging WebRTC, Firebase, and TensorFlow.js for real-time video enhancement.

## 🌟 Features

- Real-time 1-to-1 video calls using WebRTC
- Firebase Firestore for signaling and call management
- TensorFlow.js integration for on-the-fly video enhancement
- Responsive design with Bootstrap
- Email notification system for sharing call IDs

## 🚀 Technologies Used

- WebRTC
- Firebase (Firestore)
- TensorFlow.js
- JavaScript (ES6+)
- HTML5 & CSS3
- Bootstrap
- EmailJS

## 📋 Prerequisites

- Node.js (v14 or later recommended)
- npm (usually comes with Node.js)
- A Firebase account and project

## 🛠 Installation & Setup

1. Clone the repository:

    ```bash
    git clone https://github.com/sohitrharma/enhanced-video-conferencing-app.git
    cd enhanced-video-conferencing-app
2. Install dependencies:
   ```bash
    npm install

3. Update Firebase configuration:
Open `main.js` and replace the `firebaseConfig` object with your own Firebase project details.

4. Set up EmailJS (optional):
If you want to use the email notification feature, sign up at EmailJS and update the initialization in `index.html`.

5. Run the development server:
   ```bash
    npm run dev

## 🖥 Usage

1. Open the application in your browser.
2. Click "Start Webcam" to initialize your camera.
3. Click "Create Call" to generate a new call ID.
4. Share the call ID with another user, or enter a received call ID and click "Answer".
5. To end the call, click "Hangup".

## 🧠 Video Enhancement

This app uses TensorFlow.js to apply real-time enhancements to the video stream. The enhancement model is loaded from `model.json` and processes video frames to improve quality.

## 📧 Email Notifications

Users can share call IDs via email directly from the app interface. This feature uses EmailJS to send emails without a backend server.

## 🔧 Configuration

- `firebase.json`: Contains Firebase hosting configuration.
- `model.json`: Defines the TensorFlow.js model for video enhancement.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/sohitrharma/enhanced-video-conferencing-app/issues).

## 📄 License

This project is [MIT](https://choosealicense.com/licenses/mit/) licensed.

## 👤 Author

Rohit Sharma
- GitHub: [@sohitrharma](https://github.com/sohitrharma)
- LinkedIn: [@rohitsanjaysharma](https://linkedin.com/in/rohitsanjaysharma)

## 🙏 Acknowledgements

- [WebRTC](https://webrtc.org/)
- [Firebase](https://firebase.google.com/)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [EmailJS](https://www.emailjs.com/)
