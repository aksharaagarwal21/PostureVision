# PostureVision

A browser app that tracks your body through the webcam and gives live feedback on squat form.

## Features

- Real-time pose tracking with MediaPipe Pose
- Joint angle calculation from body landmarks
- Squat form feedback, such as leaning too far forward, knees too far forward, or going lower
- Automatic squat rep counting

Everything runs in the browser; no video is uploaded.

## Tech stack

React · Vite · MediaPipe Pose · react-webcam

## Run locally

```bash
npm install
npm run dev
```

Open the local URL and allow camera access.
