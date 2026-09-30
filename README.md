# PostureVision

A browser app that tracks your body through the webcam, counts squat reps and gives live feedback on your form.

Everything runs in the browser; no video is uploaded.

## Features

- **Pose tracking**: MediaPipe Tasks PoseLandmarker (lite, full or heavy model), GPU accelerated with a CPU fallback. It returns 3D world landmarks, so joint angles are measured correctly whether you face the camera, stand side-on or anything in between.
- **Rep counting**: a calibrated state machine with hysteresis. It counts a bounce at the bottom once, rejects shallow reps, knee bends without a hip drop and noise, and records the depth and timing of every rep.
- **Form analysis**: detects the camera view and uses the leg nearest the camera when filmed from the side. It flags:
  - forward lean relative to the shins
  - knees caving in
  - knees far past the toes
  - uneven or tilted hips
  - heels lifting
  - stance width
- **Form score**: a live 0–100 score, a score for each rep, and short coaching cues after each rep.
- **Train on your body**: record a few seconds of your "up" and "down" positions. A k-NN pose classifier learns your body and camera setup, tunes the rep thresholds to your squat, and can confirm each rep. Training takes seconds and stays in your browser.
- **Voice coach** (optional): announces reps and your most important form fix.

## Tech stack

React · Vite · MediaPipe Tasks Vision · Vitest

## Run locally

```bash
npm install
npm run dev
```

Open the local URL and allow camera access. Place the camera so your whole body, from shoulders to ankles, is in view.

## How to use

1. **Calibrate**: stand tall and still for about a second until the status changes to *Ready*.
2. **Squat**: reps, form score and feedback update live. The skeleton turns amber or red when there's a form issue.
3. **Train (optional)**: in *Train on your body*, press **Record UP** and hold a standing position, then **Record DOWN** and hold the bottom of your squat. Each recording takes 4 seconds after a 3-second countdown. Record each position once or twice, moving slightly while you do. Press **Test accuracy** to see the model's leave-one-out accuracy. Tick *Only count reps the trained model confirms* for the strictest counting.

Pick the **Heavy** model for maximum accuracy on a fast machine, or **Lite** on slower laptops and phones.

## How it works

```
camera frame
  └─ PoseLandmarker (src/pose/poseDetector.js)       2D + 3D landmarks
      └─ SquatSession (src/engine/squatSession.js)
          ├─ computeSquatMetrics   view detection, 3D knee/hip angles,
          │                        torso and shin lean, valgus, heel rise
          ├─ OneEuroFilter         low-lag smoothing of the knee angle
          ├─ SquatRepCounter       calibrated hysteresis state machine
          ├─ SquatPostureAnalyzer  debounced form rules and form score
          └─ PoseClassifier        optional k-NN model trained by the user
```

| File | Purpose |
| --- | --- |
| `src/engine/angleUtils.js` | 2D/3D joint angles, tilt, distances |
| `src/engine/filters.js` | One Euro filter, debounced flags, EMA |
| `src/engine/repCounter.js` | Rep state machine and validation |
| `src/engine/postureAnalyzer.js` | Metrics, form rules, form score |
| `src/engine/poseClassifier.js` | Trainable k-NN pose classifier |
| `src/engine/squatSession.js` | Pipeline for one workout session |
| `src/pose/poseDetector.js` | MediaPipe PoseLandmarker wrapper |
| `src/components/` | Camera view and dashboard panels |

## Tests

```bash
npm test
```

The tests use `tests/synthetic.js` to generate realistic squat landmarks from any camera angle, with noise, occlusion, dropped frames and common form faults. They check rep-count accuracy over hundreds of randomized sessions, the accuracy of the measured angles, fault detection and false-alarm rates, and classifier accuracy.
