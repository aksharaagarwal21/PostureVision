# PostureVision

A browser app that watches you work out through the webcam, counts your reps, checks your form and coaches you out loud.

Everything runs in the browser; no video is uploaded.

## Exercises

| Exercise | Camera | What it checks |
| --- | --- | --- |
| Squat | Front or side | Depth, chest up, knees caving in, knees past toes, heels lifting, even weight |
| Push-up | Side | Depth, sagging or piked hips, hands under shoulders |
| Lunge | Side | Depth, upright torso, front knee position |
| Bicep curl | Front or side | Full curl, elbows pinned, no swinging |
| Shoulder press | Front | Full lockout, no leaning back, even arms |
| Lateral raise | Front | Shoulder height, not too high, straight arms, no swinging |
| Jumping jack | Front | Arms overhead, feet wide |
| Glute bridge | Side | Full hip extension, foot position |
| Sit-up | Side | Full sit-up, knees bent |
| Plank (timed) | Side | Sagging or piked hips, elbows under shoulders |

## Features

- **Voice coach**: says the rep count with a verdict on every rep ("5. Good rep", "6. Go deeper", "7. Chest up"). It also calls out form mistakes as they happen, helps you get into position, marks every 5 reps, and counts out plank holds. It's on by default and can be switched off.
- **Red mistake marks**: the joints involved in a mistake get a pulsing red ring, the body segment between them turns red, and a red banner on the video tells you how to fix it.
- **Pose tracking**: MediaPipe Tasks PoseLandmarker (lite, full or heavy model), GPU accelerated with a CPU fallback. Its 3D world landmarks mean joint angles are correct whether you face the camera, stand side-on or anything in between.
- **Rep counting**: a calibrated state machine with hysteresis that works for movements where the angle closes (squat, curl) and where it opens (raise, press, bridge). A bounce at the turning point counts once. Half reps, too-fast reps and noise are rejected. Depth and timing are recorded for every rep.
- **Form score**: a live 0–100 score and a score for each rep.
- **Train on your body**: for each exercise, record a few seconds of the start and end positions. A k-NN pose classifier learns your body and camera setup, tunes the rep thresholds to you, and can confirm each rep. Training takes seconds and stays in your browser.

## Tech stack

React · Vite · MediaPipe Tasks Vision · Web Speech API · Vitest

## Run locally

```bash
npm install
npm run dev
```

Open the local URL in Chrome or Edge and allow camera access.

## How to use

1. **Pick an exercise** at the top. The instructions and the best camera angle are shown below the buttons.
2. **Get into the start position** and hold still for about a second while it calibrates.
3. **Start moving.** Reps, form score and feedback update live, and the voice coach tells you how each rep went.
4. **Train (optional)**: in *Train on your body*, record the start position and the end position (4 seconds each, after a 3-second countdown). Press **Test accuracy** to see the model's leave-one-out accuracy.

Pick the **Heavy** model for maximum accuracy on a fast machine, or **Lite** on slower laptops and phones.

## How it works

```
camera frame
  └─ PoseLandmarker (src/pose/poseDetector.js)          2D + 3D landmarks
      └─ WorkoutSession (src/engine/workoutSession.js)
          ├─ computePoseMetrics   view detection, 3D joint angles,
          │                       body alignment, arm position
          ├─ exercises.js         what to count and check per exercise
          ├─ OneEuroFilter        low-lag smoothing
          ├─ RepCounter           calibrated hysteresis state machine
          ├─ PostureAnalyzer      debounced form rules and form score
          └─ PoseClassifier       optional k-NN model trained by the user
      └─ VoiceCoach (src/engine/voiceCoach.js)       spoken feedback
      └─ overlay.js                                  skeleton and red marks
```

| File | Purpose |
| --- | --- |
| `src/engine/exercises.js` | The 10 exercises: signals, targets, form rules, voice cues |
| `src/engine/workoutSession.js` | Pipeline for one workout session |
| `src/engine/repCounter.js` | Rep state machine and validation |
| `src/engine/postureAnalyzer.js` | Leg and torso metrics, form rules, form score |
| `src/engine/poseMetrics.js` | Arm and whole-body metrics |
| `src/engine/voiceCoach.js` | What the voice coach says and when |
| `src/engine/poseClassifier.js` | Trainable k-NN pose classifier |
| `src/engine/angleUtils.js` | 2D/3D joint angles, tilt, distances |
| `src/engine/filters.js` | One Euro filter, debounced flags, EMA |
| `src/pose/poseDetector.js` | MediaPipe PoseLandmarker wrapper |
| `src/components/` | Camera view, overlay drawing and dashboard panels |

## Tests

```bash
npm test
```

The tests use `tests/synthetic.js` to generate realistic body landmarks from any camera angle, including arm movements and lying-down poses, with noise, occlusion, dropped frames and common form faults. They check:

- rep counting for every exercise
- form-mistake detection and false-alarm rates
- how accurately joint angles are measured
- classifier accuracy
- what the voice coach says
