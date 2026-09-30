// Trainable k-nearest-neighbour pose classifier.
//
// The user records examples of each pose (e.g. "up" and "down") in their own
// room with their own camera. Every example is turned into a scale- and
// position-invariant embedding, and new frames are classified by voting among
// the k most similar examples. Training takes seconds and runs fully in the
// browser; the model is a small JSON blob that can be saved to localStorage.

import { calculateAngle } from "./angleUtils";
import { LM } from "./landmarks";

// Shoulders down to feet; the face adds noise without helping
const BODY = Array.from({ length: 22 }, (_, i) => i + 11);

const MIRROR_PAIRS = [
  [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
  [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

// Extra distances that separate squat phases well
const DISTANCE_PAIRS = [
  [LM.LEFT_HIP, LM.LEFT_ANKLE], [LM.RIGHT_HIP, LM.RIGHT_ANKLE],
  [LM.LEFT_SHOULDER, LM.LEFT_ANKLE], [LM.RIGHT_SHOULDER, LM.RIGHT_ANKLE],
  [LM.LEFT_SHOULDER, LM.LEFT_KNEE], [LM.RIGHT_SHOULDER, LM.RIGHT_KNEE],
  [LM.LEFT_KNEE, LM.RIGHT_KNEE], [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
  [LM.LEFT_WRIST, LM.RIGHT_WRIST], [LM.LEFT_HIP, LM.LEFT_WRIST],
];

const ANGLE_TRIPLES = [
  [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE],
];

const Z_WEIGHT = 0.3; // image z is much noisier than x/y

function mirrorLandmarks(landmarks) {
  const out = landmarks.map((lm) => ({ ...lm, x: 1 - lm.x, z: -(lm.z ?? 0) }));
  for (const [a, b] of MIRROR_PAIRS) {
    [out[a], out[b]] = [out[b], out[a]];
  }
  return out;
}

export function poseEmbedding(landmarks, { mirror = false } = {}) {
  const pts = mirror ? mirrorLandmarks(landmarks) : landmarks;

  const hip = {
    x: (pts[LM.LEFT_HIP].x + pts[LM.RIGHT_HIP].x) / 2,
    y: (pts[LM.LEFT_HIP].y + pts[LM.RIGHT_HIP].y) / 2,
    z: ((pts[LM.LEFT_HIP].z ?? 0) + (pts[LM.RIGHT_HIP].z ?? 0)) / 2,
  };
  const shoulder = {
    x: (pts[LM.LEFT_SHOULDER].x + pts[LM.RIGHT_SHOULDER].x) / 2,
    y: (pts[LM.LEFT_SHOULDER].y + pts[LM.RIGHT_SHOULDER].y) / 2,
  };

  // Normalize by body size so distance to the camera does not matter
  const torso = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  let maxDist = 0;
  for (const i of BODY) {
    maxDist = Math.max(maxDist, Math.hypot(pts[i].x - hip.x, pts[i].y - hip.y));
  }
  const size = Math.max(torso * 2.5, maxDist, 1e-6);

  const features = [];
  for (const i of BODY) {
    features.push(
      (pts[i].x - hip.x) / size,
      (pts[i].y - hip.y) / size,
      (((pts[i].z ?? 0) - hip.z) / size) * Z_WEIGHT
    );
  }
  for (const [a, b] of DISTANCE_PAIRS) {
    features.push(Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) / size);
  }
  for (const [a, b, c] of ANGLE_TRIPLES) {
    const angle = calculateAngle(pts[a], pts[b], pts[c]);
    features.push(Number.isFinite(angle) ? angle / 180 : 0.5);
  }
  return features;
}

function embeddingDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

let nextGroupId = 1;

export class PoseClassifier {
  constructor({ k = 10, labels = ["up", "down"], minSamplesPerLabel = 10 } = {}) {
    this.k = k;
    this.labels = labels;
    this.minSamplesPerLabel = minSamplesPerLabel;
    this.samples = [];
  }

  // meta can carry measurements (e.g. knee angle) used for calibration
  addSample(label, landmarks, meta = {}) {
    if (!this.labels.includes(label)) {
      throw new Error(`Unknown label "${label}"`);
    }
    const group = nextGroupId++;
    this.samples.push({ label, group, meta, embedding: poseEmbedding(landmarks) });
    // Mirrored copy so a model trained facing left also works facing right
    this.samples.push({ label, group, meta, embedding: poseEmbedding(landmarks, { mirror: true }) });
  }

  clear() {
    this.samples = [];
  }

  clearLabel(label) {
    this.samples = this.samples.filter((s) => s.label !== label);
  }

  // Number of recorded examples per label (mirrored copies not counted)
  get counts() {
    const counts = Object.fromEntries(this.labels.map((l) => [l, 0]));
    const seen = new Set();
    for (const s of this.samples) {
      if (!seen.has(s.group)) {
        seen.add(s.group);
        counts[s.label] += 1;
      }
    }
    return counts;
  }

  get isTrained() {
    const counts = this.counts;
    return this.labels.every((l) => counts[l] >= this.minSamplesPerLabel);
  }

  neighbours(embedding, excludeGroup = null) {
    const scored = [];
    for (const s of this.samples) {
      if (s.group === excludeGroup) continue;
      scored.push({ sample: s, distance: embeddingDistance(embedding, s.embedding) });
    }
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, this.k);
  }

  vote(neighbours) {
    const votes = Object.fromEntries(this.labels.map((l) => [l, 0]));
    let total = 0;
    for (const { sample, distance } of neighbours) {
      // Closer neighbours count more
      const weight = 1 / (distance + 1e-3);
      votes[sample.label] += weight;
      total += weight;
    }
    const probabilities = {};
    for (const l of this.labels) probabilities[l] = total > 0 ? votes[l] / total : 0;

    let label = null;
    let confidence = 0;
    for (const l of this.labels) {
      if (probabilities[l] > confidence) {
        confidence = probabilities[l];
        label = l;
      }
    }
    return { label, confidence, probabilities };
  }

  classify(landmarks) {
    if (!this.isTrained || !landmarks) return null;
    const embedding = poseEmbedding(landmarks);
    const nearest = this.neighbours(embedding);
    return { ...this.vote(nearest), nearestDistance: nearest[0]?.distance ?? Infinity };
  }

  // Leave-one-out accuracy: each example is classified by all the others
  // (its own mirrored copy is excluded too, so there is no leakage).
  evaluate() {
    const groups = new Map();
    for (const s of this.samples) {
      if (!groups.has(s.group)) groups.set(s.group, s);
    }
    if (groups.size === 0) return { accuracy: NaN, total: 0, confusion: {} };

    const confusion = {};
    for (const a of this.labels) {
      confusion[a] = Object.fromEntries(this.labels.map((b) => [b, 0]));
    }
    let correct = 0;
    for (const s of groups.values()) {
      const { label } = this.vote(this.neighbours(s.embedding, s.group));
      if (label === s.label) correct += 1;
      if (label) confusion[s.label][label] += 1;
    }
    return { accuracy: correct / groups.size, total: groups.size, confusion };
  }

  // Drop examples whose neighbours mostly disagree with their label
  // (e.g. frames captured while moving between poses).
  removeOutliers(maxDisagreement = 0.6) {
    const bad = new Set();
    for (const s of this.samples) {
      const nearest = this.neighbours(s.embedding, s.group);
      if (nearest.length === 0) continue;
      const disagree = nearest.filter((n) => n.sample.label !== s.label).length / nearest.length;
      if (disagree > maxDisagreement) bad.add(s.group);
    }
    this.samples = this.samples.filter((s) => !bad.has(s.group));
    return bad.size;
  }

  // Median of a numeric meta field for one label, e.g. ("down", "kneeAngle")
  medianMeta(label, field) {
    const values = this.samples
      .filter((s) => s.label === label && Number.isFinite(s.meta?.[field]))
      .map((s) => s.meta[field])
      .sort((a, b) => a - b);
    if (values.length === 0) return NaN;
    return values[Math.floor(values.length / 2)];
  }

  toJSON() {
    return {
      version: 1,
      k: this.k,
      labels: this.labels,
      minSamplesPerLabel: this.minSamplesPerLabel,
      samples: this.samples,
    };
  }

  static fromJSON(data) {
    if (!data || data.version !== 1) return null;
    const classifier = new PoseClassifier(data);
    classifier.samples = data.samples ?? [];
    for (const s of classifier.samples) {
      nextGroupId = Math.max(nextGroupId, s.group + 1);
    }
    return classifier;
  }
}
