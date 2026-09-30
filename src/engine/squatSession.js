// End-to-end squat pipeline for one workout session.
//
// Feed it one pose result per video frame; it handles calibration, smoothing,
// form analysis, rep counting and the optional trained classifier, and
// returns everything the UI needs to render.

import { OneEuroFilter, EmaDict } from "./filters";
import { computeSquatMetrics, SquatPostureAnalyzer, reviewRep } from "./postureAnalyzer";
import { SquatRepCounter, Phase } from "./repCounter";
import { PoseClassifier } from "./poseClassifier";

export const Status = {
  NO_PERSON: "no_person",
  ADJUST: "adjust",
  CALIBRATING: "calibrating",
  ACTIVE: "active",
};

const CALIBRATION_FRAMES = 20;
const CALIBRATION_MAX_STD = 2.5;
const CUE_TTL_MS = 2500;
const RECORD_EVERY_N_FRAMES = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function stdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

export class SquatSession {
  constructor({ classifier = null, requireClassifier = false } = {}) {
    this.counter = new SquatRepCounter();
    this.analyzer = new SquatPostureAnalyzer();
    this.classifier = classifier ?? new PoseClassifier();
    this.requireClassifier = requireClassifier;
    this.angleFilter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.02, derivativeCutoff: 1.0 });
    this.probabilitySmoother = new EmaDict(0.35);
    this.recording = null;
    this.reset();
  }

  reset() {
    this.counter.reset();
    this.analyzer.reset();
    this.angleFilter.reset();
    this.probabilitySmoother.reset();
    this.calibrationBuffer = [];
    this.baseline = null;
    this.cues = [];
    this.repScores = [];
    this.currentRepScores = [];
    this.frameCount = 0;
    this.applyClassifierCalibration();
  }

  recalibrate() {
    this.calibrationBuffer = [];
    this.baseline = null;
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

  // Use the knee angles seen during training to set the rep thresholds
  applyClassifierCalibration() {
    const up = this.classifier.medianMeta("up", "kneeAngle");
    const down = this.classifier.medianMeta("down", "kneeAngle");
    if (Number.isFinite(up) && Number.isFinite(down)) {
      this.counter.calibrate({ standingAngle: up, bottomAngle: down });
    }
    this.counter.configure({
      requireClassifier: this.requireClassifier && this.classifier.isTrained,
    });
  }

  handleRecording(result, metrics, timestamp) {
    const rec = this.recording;
    if (!rec) return null;
    if (rec.startTime === null) rec.startTime = timestamp;

    rec.frames += 1;
    if (metrics?.bodyVisible && rec.frames % RECORD_EVERY_N_FRAMES === 0) {
      this.classifier.addSample(rec.label, result.landmarks, {
        kneeAngle: metrics.kneeAngle,
        hipAngle: metrics.hipAngle,
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

    const landmarks = result?.landmarks;
    if (!landmarks) {
      const counterState = this.counter.update({ angle: NaN, timestamp, reliable: false });
      return this.output({ status: Status.NO_PERSON, timestamp, counterState });
    }

    const metrics = computeSquatMetrics(landmarks, result.world ?? null);
    const recording = this.handleRecording(result, metrics, timestamp);

    if (!metrics?.bodyVisible) {
      const counterState = this.counter.update({ angle: NaN, timestamp, reliable: false });
      return this.output({ status: Status.ADJUST, timestamp, metrics, counterState, recording });
    }

    const kneeAngle = this.angleFilter.filter(metrics.kneeAngle, timestamp);

    if (!this.baseline) {
      this.calibrate(metrics, kneeAngle);
      if (!this.baseline) {
        const counterState = this.counter.update({ angle: NaN, timestamp, reliable: false });
        return this.output({
          status: Status.CALIBRATING,
          timestamp,
          metrics,
          kneeAngle,
          counterState,
          recording,
          calibrationProgress: this.calibrationBuffer.length / CALIBRATION_FRAMES,
        });
      }
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

    const hipDrop = this.baseline.thighLength > 1e-6
      ? (metrics.hipY - this.baseline.hipY) / this.baseline.thighLength
      : NaN;

    const counterState = this.counter.update({
      angle: kneeAngle,
      timestamp,
      reliable: true,
      hipDrop,
      downProbability: classification?.probabilities?.down,
    });

    const inRep = counterState.phase !== Phase.STANDING;
    const form = this.analyzer.analyze(metrics, { inRep });
    if (inRep) this.currentRepScores.push(form.frameScore);

    const event = counterState.event;
    if (event?.type === "rep" || event?.type === "partial") {
      const avgFormScore = this.currentRepScores.length
        ? this.currentRepScores.reduce((a, b) => a + b, 0) / this.currentRepScores.length
        : 100;
      const review = reviewRep(event.rep, { avgFormScore });
      event.rep.formScore = review.score;
      if (event.rep.counted) this.repScores.push(review.score);
      for (const cue of review.cues) {
        this.cues.push({ ...cue, expires: timestamp + CUE_TTL_MS });
      }
      this.currentRepScores = [];
    } else if (event?.type === "aborted") {
      this.currentRepScores = [];
    }

    return this.output({
      status: Status.ACTIVE,
      timestamp,
      metrics,
      kneeAngle,
      hipDrop,
      form,
      counterState,
      classification,
      recording,
    });
  }

  calibrate(metrics, kneeAngle) {
    // Wait for the user to stand still and tall
    if (!(kneeAngle > 150)) {
      this.calibrationBuffer = [];
      return;
    }
    this.calibrationBuffer.push({ kneeAngle, metrics });
    if (this.calibrationBuffer.length > CALIBRATION_FRAMES) this.calibrationBuffer.shift();
    if (this.calibrationBuffer.length < CALIBRATION_FRAMES) return;

    const angles = this.calibrationBuffer.map((f) => f.kneeAngle);
    if (stdDev(angles) > CALIBRATION_MAX_STD) return;

    const frames = this.calibrationBuffer.map((f) => f.metrics);
    this.baseline = {
      kneeAngle: median(angles),
      hipY: median(frames.map((m) => m.hipY)),
      thighLength: median(frames.map((m) => m.thighLength)),
    };
    this.analyzer.calibrate({ ...metrics, heelRise: median(frames.map((m) => m.heelRise)) });

    // Trained data gives the best thresholds; otherwise use the standing angle
    const down = this.classifier.medianMeta("down", "kneeAngle");
    this.counter.calibrate({ standingAngle: this.baseline.kneeAngle, bottomAngle: down });
  }

  output({ status, timestamp, metrics = null, kneeAngle = NaN, hipDrop = NaN, form = null,
    counterState, classification = null, recording = null, calibrationProgress = 1 }) {
    const history = this.counter.history;
    const averageFormScore = this.repScores.length
      ? Math.round(this.repScores.reduce((a, b) => a + b, 0) / this.repScores.length)
      : null;

    return {
      status,
      timestamp,
      calibrated: Boolean(this.baseline),
      calibrationProgress,
      metrics,
      kneeAngle,
      hipDrop,
      reps: counterState.reps,
      partialReps: counterState.partialReps,
      phase: counterState.phase,
      event: counterState.event,
      progress: this.counter.progress(kneeAngle),
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
