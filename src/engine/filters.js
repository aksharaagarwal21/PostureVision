// Signal filters for noisy pose data.

function smoothingFactor(elapsedSeconds, cutoffHz) {
  const r = 2 * Math.PI * cutoffHz * elapsedSeconds;
  return r / (r + 1);
}

// One Euro filter (Casiez et al., CHI 2012).
// Heavy smoothing when the signal is still, light smoothing when it moves fast,
// so it removes jitter without the lag of a plain moving average.
export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.0, derivativeCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.reset();
  }

  reset() {
    this.value = null;
    this.derivative = 0;
    this.lastTimestamp = null;
  }

  // timestampMs must increase between calls
  filter(x, timestampMs) {
    if (!Number.isFinite(x)) return this.value ?? x;

    if (this.value === null) {
      this.value = x;
      this.lastTimestamp = timestampMs;
      return x;
    }

    let elapsed = (timestampMs - this.lastTimestamp) / 1000;
    if (!(elapsed > 0)) elapsed = 1 / 30;
    this.lastTimestamp = timestampMs;

    const rawDerivative = (x - this.value) / elapsed;
    const derivativeAlpha = smoothingFactor(elapsed, this.derivativeCutoff);
    this.derivative += derivativeAlpha * (rawDerivative - this.derivative);

    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    const alpha = smoothingFactor(elapsed, cutoff);
    this.value += alpha * (x - this.value);

    return this.value;
  }
}

// Applies an independent One Euro filter to x, y and z of every landmark.
export class LandmarkSmoother {
  constructor(options = { minCutoff: 1.5, beta: 5, derivativeCutoff: 1.0 }) {
    this.options = options;
    this.filters = [];
  }

  reset() {
    this.filters = [];
  }

  smooth(landmarks, timestampMs) {
    if (!landmarks) return landmarks;

    return landmarks.map((lm, i) => {
      if (!this.filters[i]) {
        this.filters[i] = {
          x: new OneEuroFilter(this.options),
          y: new OneEuroFilter(this.options),
          z: new OneEuroFilter(this.options),
        };
      }
      const f = this.filters[i];
      return {
        ...lm,
        x: f.x.filter(lm.x, timestampMs),
        y: f.y.filter(lm.y, timestampMs),
        z: f.z.filter(lm.z ?? 0, timestampMs),
      };
    });
  }
}

// A boolean that only turns on after `onFrames` consecutive true inputs and
// only turns off after `offFrames` consecutive false inputs. Stops feedback
// messages from flickering on single noisy frames.
export class StableFlag {
  constructor(onFrames = 4, offFrames = 8) {
    this.onFrames = onFrames;
    this.offFrames = offFrames;
    this.reset();
  }

  reset() {
    this.active = false;
    this.streak = 0;
  }

  update(condition) {
    if (condition === this.active) {
      this.streak = 0;
    } else {
      this.streak += 1;
      if (this.streak >= (condition ? this.onFrames : this.offFrames)) {
        this.active = condition;
        this.streak = 0;
      }
    }
    return this.active;
  }
}

// Exponential moving average over a map of values (e.g. class probabilities).
export class EmaDict {
  constructor(alpha = 0.3) {
    this.alpha = alpha;
    this.values = {};
  }

  reset() {
    this.values = {};
  }

  update(input) {
    const keys = new Set([...Object.keys(this.values), ...Object.keys(input)]);
    for (const key of keys) {
      const prev = this.values[key] ?? 0;
      const next = input[key] ?? 0;
      this.values[key] = prev + this.alpha * (next - prev);
    }
    return { ...this.values };
  }
}
