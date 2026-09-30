import { describe, it, expect } from "vitest";
import { SquatRepCounter, Phase } from "../src/engine/repCounter";
import { OneEuroFilter } from "../src/engine/filters";
import { mulberry32, gaussian } from "./synthetic";

const DT = 1000 / 30;

// Knee-angle trace: standing at `standing`, dipping to each rep's depth
function trace(reps, { standing = 172, rand = null, noise = 0, leadMs = 1000 } = {}) {
  const frames = [];
  let t = 0;
  const push = (angle) => {
    const jitter = rand ? noise * gaussian(rand) : 0;
    frames.push({ angle: angle + jitter, timestamp: t });
    t += DT;
  };
  for (let e = 0; e < leadMs; e += DT) push(standing);
  for (const rep of reps) {
    const n = Math.round(rep.durationMs / DT);
    for (let i = 0; i <= n; i++) {
      const shaped = Math.min(1, Math.sin((Math.PI * i) / n) * 1.15);
      push(standing - (standing - rep.bottom) * shaped);
    }
    for (let e = 0; e < (rep.pauseMs ?? 600); e += DT) push(standing);
  }
  return frames;
}

function run(counter, frames, filter = null) {
  const events = [];
  for (const f of frames) {
    const angle = filter ? filter.filter(f.angle, f.timestamp) : f.angle;
    const r = counter.update({ ...f, angle });
    if (r.event) events.push(r.event);
  }
  return events;
}

describe("SquatRepCounter", () => {
  it("counts clean reps", () => {
    const counter = new SquatRepCounter({ standingAngle: 172 });
    run(counter, trace([{ bottom: 90, durationMs: 2000 }, { bottom: 85, durationMs: 1500 }, { bottom: 95, durationMs: 1800 }]));
    expect(counter.reps).toBe(3);
    expect(counter.phase).toBe(Phase.STANDING);
  });

  it("reports shallow reps as partial instead of counting them", () => {
    const counter = new SquatRepCounter({ standingAngle: 172 });
    const events = run(counter, trace([{ bottom: 90, durationMs: 2000 }, { bottom: 140, durationMs: 1500 }]));
    expect(counter.reps).toBe(1);
    expect(counter.partialReps).toBe(1);
    expect(events[1].rep.reason).toBe("not enough range of motion");
  });

  it("counts a bounce at the bottom only once", () => {
    const counter = new SquatRepCounter({ standingAngle: 172 });
    const frames = [];
    let t = 0;
    const angles = [172, 160, 140, 120, 100, 90, 105, 95, 88, 100, 120, 140, 160, 170, 172, 172, 172];
    for (const a of angles) {
      for (let k = 0; k < 4; k++) {
        frames.push({ angle: a, timestamp: t });
        t += DT;
      }
    }
    run(counter, frames);
    expect(counter.reps).toBe(1);
    expect(counter.history[0].depthAngle).toBe(88);
  });

  it("finishes the rep when the user never fully reaches the calibrated top", () => {
    // Calibrated at 179 but the user only stands up to 162
    const counter = new SquatRepCounter({ standingAngle: 179 });
    run(counter, trace([{ bottom: 90, durationMs: 2000, pauseMs: 1500 }, { bottom: 90, durationMs: 2000, pauseMs: 1500 }], { standing: 162 }));
    expect(counter.reps).toBe(2);
  });

  it("aborts a rep when tracking is lost for too long", () => {
    const counter = new SquatRepCounter({ standingAngle: 172 });
    let t = 0;
    for (const a of [172, 150, 130, 110]) {
      for (let k = 0; k < 4; k++) {
        counter.update({ angle: a, timestamp: (t += DT) });
      }
    }
    for (let k = 0; k < 60; k++) counter.update({ angle: NaN, timestamp: (t += DT), reliable: false });
    expect(counter.phase).toBe(Phase.STANDING);
    expect(counter.reps).toBe(0);
  });

  it("rejects knee bends where the hips do not drop", () => {
    const counter = new SquatRepCounter({ standingAngle: 172 });
    const frames = trace([{ bottom: 90, durationMs: 2000 }]).map((f) => ({ ...f, hipDrop: 0.05 }));
    run(counter, frames);
    expect(counter.reps).toBe(0);
    expect(counter.history[0].reason).toBe("hips did not drop");
  });

  it("calibrates thresholds from standing and bottom angles", () => {
    const counter = new SquatRepCounter();
    counter.calibrate({ standingAngle: 165, bottomAngle: 105 });
    // A user whose full squat only reaches 105 degrees still gets counted
    run(counter, trace([{ bottom: 105, durationMs: 2000 }, { bottom: 108, durationMs: 2000 }], { standing: 165 }));
    expect(counter.reps).toBe(2);
  });

  it("counts movements where the angle rises, like a lateral raise", () => {
    const counter = new SquatRepCounter({
      direction: "increase",
      standingAngle: 15,
      goodDepthAngle: 80,
      minRangeOfMotion: 45,
    });
    // trace() dips below the rest angle, so mirror it around the rest angle
    const frames = trace([{ bottom: -70, durationMs: 1800 }, { bottom: -60, durationMs: 1500 }, { bottom: -10, durationMs: 1500 }], { standing: 15 })
      .map((f) => ({ ...f, angle: 30 - f.angle }));
    const events = run(counter, frames);
    expect(counter.reps).toBe(2);
    expect(counter.partialReps).toBe(1);
    expect(events[0].rep.depthAngle).toBeCloseTo(100, 0);
    expect(events[0].rep.reachedTarget).toBe(true);
  });

  it("counts exactly right on at least 98% of noisy random sessions", () => {
    const rand = mulberry32(42);
    const sessions = 300;
    let exact = 0;

    for (let s = 0; s < sessions; s++) {
      const standing = 160 + rand() * 18;
      const nReps = 1 + Math.floor(rand() * 12);
      const reps = [];
      let expected = 0;
      for (let r = 0; r < nReps; r++) {
        const partial = rand() < 0.15;
        const bottom = partial ? standing - 15 - rand() * 12 : 70 + rand() * 45;
        if (!partial) expected += 1;
        reps.push({ bottom, durationMs: 900 + rand() * 2600, pauseMs: 200 + rand() * 1200 });
      }

      const counter = new SquatRepCounter({ standingAngle: standing });
      const filter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.02 });
      run(counter, trace(reps, { standing, rand, noise: 3 }), filter);
      if (counter.reps === expected) exact += 1;
    }

    expect(exact / sessions).toBeGreaterThanOrEqual(0.98);
  });
});
