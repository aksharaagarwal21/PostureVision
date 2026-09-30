# PostureVision

A browser app that plans and guides your workouts. It watches you through the webcam, counts your reps, checks your form, times your sets and rest breaks, and coaches you out loud.

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

- **Your own workout plan**: pick exercises and set the number of sets, the reps or seconds per set, the rest between sets and the rest between exercises. You can also start from a template (beginner full body, upper body, lower body, core and cardio). Plans can be saved, and the planner shows the estimated time and calories.
- **Guided workouts**: a get-ready countdown, a live set target ("7 / 12 reps" or a countdown for timed sets) and automatic moves to the next set when you hit your target. Rest breaks get a big countdown, a preview of what's next with its demo and steps, and **+20 s** / **Skip rest** buttons. You can pause, skip an exercise or end early.
- **Performance records**: reps, form score, time and approximate calories for every set, saved to your history. The history page shows totals, workouts this week, your day streak and personal bests.
- **Calorie estimate**: MET × body weight × time, using values from the Compendium of Physical Activities. It's an approximation.
- **Exercise guides**: every exercise has an animated demo, numbered steps each with a picture, the muscles worked and form tips. The pictures and animations are drawn by the app from a built-in figure model; no photos are downloaded.
- **Voice coach**: announces each set, the last three seconds of countdowns, rest breaks and what's next. During a set it says the rep count with a verdict on every rep ("5. Good rep", "6. Go deeper", "7. Chest up"). It also calls out form mistakes as they happen, helps you get into position, marks every 5 reps, and counts out plank holds. It's on by default and can be switched off.
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

**Guided workout (My workout tab)**

1. Enter your body weight (only used for calorie estimates) and pick a template, or build your own plan.
2. For each exercise, set the sets, reps or seconds per set, and the rest between sets. Set the rest between exercises at the bottom.
3. Press **Start workout**. Get into position during the countdown; the voice tells you when to go.
4. Do your reps. The set ends by itself when you hit the target (or press **Finish set**). Rest, then carry on.
5. At the end you get a summary, and the workout is saved to **History**.

**Free practice**

Pick any exercise and train without a plan. Press **How to do it** for the demo and steps. You can also record your own start and end positions in *Train on your body* so the app learns your body and camera setup.

Pick the **Heavy** tracking model for maximum accuracy on a fast machine, or **Lite** on slower laptops and phones.

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

workout plan (src/engine/workoutPlan.js)
  └─ WorkoutRunner (src/engine/workoutRunner.js)     sets, rests, timers, results
      ├─ workoutAnnouncer.js                         spoken set and rest cues
      ├─ calories.js                                 MET-based estimate
      └─ history.js                                  saved workouts and bests
```

| File | Purpose |
| --- | --- |
| `src/engine/exercises.js` | The 10 exercises: signals, targets, form rules, voice cues, MET |
| `src/engine/workoutPlan.js` | Plans, templates, time and calorie estimates |
| `src/engine/workoutRunner.js` | Runs a plan: countdowns, sets, rests, results |
| `src/engine/workoutAnnouncer.js` | What the voice says during a guided workout |
| `src/engine/calories.js` | Calorie estimate |
| `src/engine/history.js` | Workout history, profile, saved plans, personal bests |
| `src/demo/` | Demo figure poses and drawing |
| `src/content/exerciseGuides.js` | Step-by-step instructions and tips |
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
- plans, the workout runner (sets, rests, pause, skip), calories and history
