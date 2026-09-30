// End-to-end pipeline for one workout session.
//
// Feed it one pose result per video frame; it handles calibration, smoothing,
// form analysis, rep counting (or hold timing) and the optional trained
// classifier for the selected exercise, and returns everything the UI and
// voice coach need.

import { OneEuroFilter, EmaDict } from "./filters";
import { PostureAnalyzer, reviewRep } from "./postureAnalyzer";
import { RepCounter, Phase, DEFAULT_REP_CONFIG } from "./repCounter";
import { PoseClassifier } from "./poseClassifier";
import { computePoseMetrics, partsVisible, jointsFor } from "./poseMetrics";
import { getExercise } from "./exercises";

export const Status = {
  NO_PERSON: "no_person",
  ADJUST: "adjust",
  CALIBRATING: "calibrating",
  ACTIVE: "active",
};

export const CLASS_LABELS = ["rest", "active"];

const CALIBRATION_FRAMES = 20;
const CALIBRATION_MAX_STD = 2.5;
const CUE_TTL_MS = 2500;
const RECORD_EVERY_N_FRAMES = 3;
const MAX_HOLD_STEP_MS = 250;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function stdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function emptyHold() {
  return { totalMs: 0, goodFormMs: 0, currentMs: 0, bestMs: 0, holding: false, lastTime: null };
}

export class WorkoutSession {
  constructor({ exercise = "squat", classifier = null, requireClassifier = false } = {}) {
    this.requireClassifier = requireClassifier;
    this.angleFilter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.02, derivativeCutoff: 1.0 });
    this.probabilitySmoother = new EmaDict(0.35);
    this.setExercise(exercise, classifier);
  }

  // exercise: id or definition from exercises.js
  setExercise(exercise, classifier = null) {
    this.exercise = typeof exercise === "string" ? getExercise(exercise) : exercise;
    this.classifier = classifier ?? new PoseClassifier({ labels: CLASS_LABELS });
    this.counter = new RepCounter(this.exercise.counter);
    this.analyzer = new PostureAnalyzer(this.exercise.rules);
    this.recording = null;
    this.reset();
  }

  get isHold() {
    return this.exercise.kind === "hold";
  }

  reset() {
    this.counter.reset();
    this.counter.config = { ...DEFAULT_REP_CONFIG, ...this.exercise.counter };
    this.analyzer.reset();
    this.angleFilter.reset();
    this.probabilitySmoother.reset();
    this.calibrationBuffer = [];
    this.baseline = null;
    this.cues = [];
    this.repScores = [];
    this.currentRepScores = [];
    this.currentRepIssues = new Map();
    this.hold = emptyHold();
    this.frameCount = 0;
    this.applyClassifierCalibration();
  }

  recalibrate() {
    this.calibrationBuffer = [];
    this.baseline = null;
  }

  // Forget the trained model and go back to the default rep thresholds
  clearTraining() {
    this.classifier.clear();
    this.requireClassifier = false;
    this.counter.config = { ...DEFAULT_REP_CONFIG, ...this.exercise.counter };
    this.probabilitySmoother.reset();
    this.recalibrate();
  }

  setRequireClassifier(value) {
    this.requireClassifier = value;
    this.counter.configure({ requireClassifier: value && this.classifier.isTrained });
  }

  // --- Training ---------------------------------------------------------

  startRecording(label, durationMs = 3000) {
    this.recording = { label, durationMs, startTime: null, added: 0, frames: 0 };
  }

  stopRecording() {
    const finished = this.recording;
    this.recording = null;
    if (finished && this.classifier.isTrained) {
      this.classifier.removeOutliers();
    }
    this.applyClassifierCalibration();
    return finished;
  }

  // Use the angles seen during training to set the rep thresholds
  applyClassifierCalibration() {
    const rest = this.classifier.medianMeta("rest", "signal");
    const active = this.classifier.medianMeta("active", "signal");
    if (!this.isHold && Number.isFinite(rest) && Number.isFinite(active)) {
      this.counter.calibrate({ standingAngle: rest, bottomAngle: active });
    }
    this.counter.configure({
      requireClassifier: this.requireClassifier && this.classifier.isTrained,
    });
  }

  handleRecording(result, metrics, visible, timestamp) {
    const rec = this.recording;
    if (!rec) return null;
    if (rec.startTime === null) rec.startTime = timestamp;

    rec.frames += 1;
    if (visible && rec.frames % RECORD_EVERY_N_FRAMES === 0) {
      this.classifier.addSample(rec.label, result.landmarks, {
        signal: this.exercise.signal(metrics),
      });
      rec.added += 1;
    }

    const elapsed = timestamp - rec.startTime;
    const progress = Math.min(1, elapsed / rec.durationMs);
    const status = { label: rec.label, progress, added: rec.added };
    if (progress >= 1) this.stopRecording();
    return status;
  }

  // --- Per-frame processing ------------------------------------------------

  // result: { landmarks, world } from the pose detector (either may be null)
  processFrame(result, timestamp) {
    this.frameCount += 1;
    this.cues = this.cues.filter((c) => c.expires > timestamp);
    const ex = this.exercise;

    const landmarks = result?.landmarks;
    if (!landmarks) {
      return this.idle(Status.NO_PERSON, timestamp, { message: "Step into the frame" });
    }

    const metrics = computePoseMetrics(landmarks, result.world ?? null);
    const visible = Boolean(metrics) && partsVisible(landmarks, metrics, ex.parts);
    const recording = this.handleRecording(result, metrics, visible, timestamp);

    if (!visible) {
      return this.idle(Status.ADJUST, timestamp, {
        metrics,
        recording,
        message: `Move so your ${ex.parts.join(", ")} are in view`,
      });
    }

    const inPosition = ex.inPosition ? Boolean(ex.inPosition(metrics)) : true;
    const angle = this.angleFilter.filter(ex.signal(metrics), timestamp);

    if (this.isHold) {
      return this.processHold({ metrics, angle, inPosition, recording, timestamp });
    }

    if (!this.baseline) {
      if (inPosition) this.calibrate(metrics, angle);
      else this.calibrationBuffer = [];

      if (!this.baseline) {
        return this.idle(Status.CALIBRATING, timestamp, {
          metrics,
          angle,
          recording,
          calibrationProgress: this.calibrationBuffer.length / CALIBRATION_FRAMES,
          message: inPosition
            ? `Hold still in the start position: ${ex.labels.rest.toLowerCase()}`
            : ex.positionHint,
        });
      }
    }

    if (!inPosition) {
      return this.idle(Status.ADJUST, timestamp, { metrics, angle, recording, message: ex.positionHint });
    }

    // Classifier
    let classification = null;
    if (this.classifier.isTrained) {
      const raw = this.classifier.classify(landmarks);
      if (raw) {
        const probabilities = this.probabilitySmoother.update(raw.probabilities);
        classification = { ...raw, probabilities };
      }
    }

    const hipDrop = ex.useHipDrop && this.baseline.thighLength > 1e-6
      ? (metrics.hipY - this.baseline.hipY) / this.baseline.thighLength
      : NaN;

    const counterState = this.counter.update({
      angle,
      timestamp,
      reliable: true,
      hipDrop,
      activeProbability: classification?.probabilities?.active,
    });

    const inRep = counterState.phase !== Phase.STANDING;
    const form = this.analyzer.analyze(metrics, { inRep, reliable: true });
    if (inRep) {
      this.currentRepScores.push(form.frameScore);
      for (const issue of form.issues) {
        if (issue.severity !== "info") this.currentRepIssues.set(issue.id, issue);
      }
    }

    const event = counterState.event;
    if (event?.type === "rep" || event?.type === "partial") {
      this.finishRepReview(event.rep, timestamp);
    } else if (event?.type === "aborted") {
      this.currentRepScores = [];
      this.currentRepIssues.clear();
    }

    return this.output({
      status: Status.ACTIVE,
      timestamp,
      metrics,
      angle,
      form,
      counterState,
      classification,
      recording,
    });
  }

  finishRepReview(rep, timestamp) {
    const ex = this.exercise;
    const avgFormScore = this.currentRepScores.length
      ? this.currentRepScores.reduce((a, b) => a + b, 0) / this.currentRepScores.length
      : 100;
    const review = reviewRep(rep, {
      avgFormScore,
      targetMessage: ex.targetMessage,
      slowRepMs: ex.slowRepMs ?? 1000,
    });
    rep.formScore = review.score;
    // Worst problems first, so the voice coach can mention the main one
    rep.issues = [...this.currentRepIssues.values()].sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1
    );
    if (rep.counted) this.repScores.push(review.score);
    for (const cue of review.cues) {
      this.cues.push({ ...cue, expires: timestamp + CUE_TTL_MS });
    }
    this.currentRepScores = [];
    this.currentRepIssues.clear();
  }

  processHold({ metrics, angle, inPosition, recording, timestamp }) {
    const hold = this.hold;
    const step = hold.lastTime === null ? 0 : Math.min(MAX_HOLD_STEP_MS, timestamp - hold.lastTime);
    hold.lastTime = timestamp;

    const form = this.analyzer.analyze(metrics, { inRep: inPosition, reliable: true });
    let event = null;

    if (inPosition) {
      if (!hold.holding) event = { type: "hold_start" };
      hold.holding = true;
      hold.currentMs += step;
      hold.totalMs += step;
      if (!form.issues.some((i) => i.severity === "error")) hold.goodFormMs += step;
      hold.bestMs = Math.max(hold.bestMs, hold.currentMs);
    } else if (hold.holding) {
      event = { type: "hold_end", durationMs: hold.currentMs };
      hold.holding = false;
      hold.currentMs = 0;
    }

    return this.output({
      status: inPosition ? Status.ACTIVE : Status.ADJUST,
      timestamp,
      metrics,
      angle,
      form,
      recording,
      event,
      message: inPosition ? null : this.exercise.positionHint,
    });
  }

  calibrate(metrics, angle) {
    const [low, high] = this.exercise.restRange;
    // Wait for the user to hold still in the rest position
    if (!(angle >= low && angle <= high)) {
      this.calibrationBuffer = [];
      return;
    }
    this.calibrationBuffer.push({ angle, metrics });
    if (this.calibrationBuffer.length > CALIBRATION_FRAMES) this.calibrationBuffer.shift();
    if (this.calibrationBuffer.length < CALIBRATION_FRAMES) return;

    const angles = this.calibrationBuffer.map((f) => f.angle);
    if (stdDev(angles) > CALIBRATION_MAX_STD) return;

    const frames = this.calibrationBuffer.map((f) => f.metrics);
    this.baseline = {
      angle: median(angles),
      hipY: median(frames.map((m) => m.hipY)),
      thighLength: median(frames.map((m) => m.thighLength)),
    };
    this.analyzer.calibrate({
      ...metrics,
      heelRise: median(frames.map((m) => m.heelRise)),
      torsoLean: median(frames.map((m) => m.torsoLean)),
    });

    // Trained data gives the best thresholds; otherwise use the rest angle
    const active = this.classifier.medianMeta("active", "signal");
    this.counter.calibrate({ standingAngle: this.baseline.angle, bottomAngle: active });
  }

  idle(status, timestamp, extra = {}) {
    if (this.isHold && this.hold.holding) {
      this.hold.holding = false;
      this.hold.currentMs = 0;
      this.hold.lastTime = null;
    }
    const counterState = this.counter.update({ angle: NaN, timestamp, reliable: false });
    return this.output({ status, timestamp, counterState, ...extra });
  }

  output({ status, timestamp, metrics = null, angle = NaN, form = null, counterState = null,
    classification = null, recording = null, calibrationProgress = 1, message = null, event = null }) {
    const ex = this.exercise;
    const history = this.counter.history;
    const averageFormScore = this.repScores.length
      ? Math.round(this.repScores.reduce((a, b) => a + b, 0) / this.repScores.length)
      : null;

    return {
      status,
      message,
      timestamp,
      exerciseId: ex.id,
      kind: ex.kind,
      calibrated: this.isHold || Boolean(this.baseline),
      calibrationProgress,
      metrics,
      angle,
      angleLabel: ex.signalLabel,
      labelJoint: metrics ? jointsFor(metrics, [ex.labelPart])[0] ?? null : null,
      reps: this.counter.reps,
      partialReps: this.counter.partialReps,
      phase: counterState?.phase ?? this.counter.phase,
      event: counterState?.event ?? event,
      progress: this.isHold ? 0 : this.counter.progress(angle),
      hold: this.isHold ? { ...this.hold } : null,
      issues: form?.issues ?? [],
      formScore: form?.score ?? null,
      averageFormScore,
      cues: this.cues,
      lastRep: history[history.length - 1] ?? null,
      history,
      classification,
      recording: recording ?? (this.recording ? { label: this.recording.label, progress: 0, added: 0 } : null),
      trainingCounts: this.classifier.counts,
      classifierTrained: this.classifier.isTrained,
    };
  }
}

// Squat-only session, kept for existing callers
export class SquatSession extends WorkoutSession {
  constructor(options = {}) {
    super({ ...options, exercise: "squat" });
  }
}
