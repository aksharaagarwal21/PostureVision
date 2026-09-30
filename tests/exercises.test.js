import { describe, it, expect } from "vitest";
import { EXERCISES, getExercise } from "../src/engine/exercises";
import { WorkoutSession, Status } from "../src/engine/workoutSession";
import { RepCounter } from "../src/engine/repCounter";
import { PostureAnalyzer } from "../src/engine/postureAnalyzer";
import { computePoseMetrics } from "../src/engine/poseMetrics";
import { synthPose, repTrace, mulberry32 } from "./synthetic";

const lerp = (a, b, t) => a + (b - a) * t;

// How each exercise looks at a given point in the rep (0 = rest, 1 = full)
const POSES = {
  squat: (t) => ({ depth: t }),
  lunge: (t) => ({ depth: t }),
  curl: (t) => ({ arms: { abduction: 5, elbow: lerp(10, 130, t) } }),
  lateral_raise: (t) => ({ arms: { abduction: lerp(10, 88, t), elbow: 15 } }),
  press: (t) => ({ scale: 0.34, arms: { abduction: lerp(85, 165, t), elbow: lerp(95, 10, t), bend: "up" } }),
  jumping_jack: (t) => ({
    scale: 0.34,
    stance: lerp(0.17, 0.45, t),
    arms: { abduction: lerp(15, 160, t), elbow: 10 },
  }),
  pushup: (t) => ({
    pitch: 78,
    baseLean: 0,
    arms: { flexion: 90, elbow: lerp(10, 95, t), bend: "up" },
  }),
};

function runReps(exerciseId, yaw, reps, { noise = 0.004, worldNoise = 0.01, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const session = new WorkoutSession({ exercise: exerciseId });
  const poseAt = POSES[exerciseId];
  let state;
  for (const f of repTrace(reps)) {
    const pose = synthPose(poseAt(f.level).depth ?? 0, { yaw, noise, worldNoise, rand, ...poseAt(f.level) });
    state = session.processFrame(pose, f.t);
  }
  return state;
}

const FOUR_REPS = [
  { level: 1, durationMs: 1800 },
  { level: 0.9, durationMs: 1500 },
  { level: 1, durationMs: 2200 },
  { level: 0.95, durationMs: 1600 },
];

function issuesFor(exerciseId, poseOptions, { inRep = true, yaw = 90 } = {}) {
  const ex = getExercise(exerciseId);
  const analyzer = new PostureAnalyzer(ex.rules);
  const pose = synthPose(poseOptions.depth ?? 0, { yaw, ...poseOptions });
  const m = computePoseMetrics(pose.landmarks, pose.world);
  let result;
  for (let i = 0; i < 6; i++) result = analyzer.analyze(m, { inRep, reliable: true });
  return result.issues;
}

describe("exercise library", () => {
  it("has 10 exercises with everything the session needs", () => {
    expect(EXERCISES).toHaveLength(10);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(10);
    for (const ex of EXERCISES) {
      expect(ex.name).toBeTruthy();
      expect(ex.instructions).toBeTruthy();
      expect(ex.parts.length).toBeGreaterThan(0);
      expect(typeof ex.signal).toBe("function");
      expect(ex.rules.length).toBeGreaterThan(0);
      for (const rule of ex.rules) {
        expect(rule.voice).toBeTruthy();
        expect(typeof rule.joints).toBe("function");
      }
      if (ex.kind === "reps") {
        expect(ex.restRange).toHaveLength(2);
        expect(ex.targetVoice).toBeTruthy();
      }
    }
  });
});

describe("rep counting per exercise", () => {
  it.each([
    ["squat", 0],
    ["lunge", 90],
    ["curl", 0],
    ["curl", 90],
    ["lateral_raise", 0],
    ["press", 0],
    ["jumping_jack", 0],
    ["pushup", 90],
    ["pushup", -90],
  ])("%s from yaw %i counts 4 reps", (id, yaw) => {
    const state = runReps(id, yaw, FOUR_REPS);
    expect(state.status).toBe(Status.ACTIVE);
    expect(state.reps).toBe(4);
  });

  it("does not count half reps as full ones", () => {
    const state = runReps("curl", 0, [
      { level: 1, durationMs: 1800 },
      { level: 0.3, durationMs: 1500 },
      { level: 1, durationMs: 1800 },
    ]);
    expect(state.reps).toBe(2);
  });

  it("counts fast jumping jacks", () => {
    const reps = Array.from({ length: 10 }, () => ({ level: 1, durationMs: 700, pauseMs: 150 }));
    expect(runReps("jumping_jack", 0, reps).reps).toBe(10);
  });

  it("waits for the start position before a shoulder press", () => {
    const session = new WorkoutSession({ exercise: "press" });
    // Arms hanging down: not in the press start position
    const state = session.processFrame(synthPose(0, { yaw: 0, arms: { abduction: 5, elbow: 10 } }), 0);
    expect(state.status).toBe(Status.CALIBRATING);
    expect(state.message).toMatch(/shoulder height/);
  });

  it.each([
    ["glute_bridge", 135, 172],
    ["situp", 135, 65],
  ])("%s counts reps from its hip angle", (id, rest, top) => {
    const ex = getExercise(id);
    const counter = new RepCounter(ex.counter);
    counter.calibrate({ standingAngle: rest });
    let t = 0;
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i <= 50; i++) {
        counter.update({ angle: rest + (top - rest) * Math.sin((Math.PI * i) / 50), timestamp: (t += 33) });
      }
      for (let i = 0; i < 20; i++) counter.update({ angle: rest, timestamp: (t += 33) });
    }
    expect(counter.reps).toBe(3);
    expect(counter.history.every((r) => r.reachedTarget)).toBe(true);
  });
});

describe("form checks per exercise", () => {
  const push = { pitch: 78, baseLean: 0, arms: { flexion: 90, elbow: 10 } };

  it("push-up: good form has no mistakes", () => {
    expect(issuesFor("pushup", push)).toEqual([]);
  });

  it("push-up: flags sagging and piked hips and marks the hips", () => {
    const sag = issuesFor("pushup", { ...push, hipSag: 0.12 });
    expect(sag.map((i) => i.id)).toContain("hip_sag");
    expect(sag.find((i) => i.id === "hip_sag").joints).toContain(24);
    expect(issuesFor("pushup", { ...push, hipSag: -0.15 }).map((i) => i.id)).toContain("hip_pike");
  });

  it("plank: flags sagging hips", () => {
    const plank = { pitch: 82, baseLean: 0, hipSag: 0.12, arms: { flexion: 90, elbow: 90, bend: "up" } };
    expect(issuesFor("plank", plank).map((i) => i.id)).toContain("hip_sag");
  });

  it("curl: flags elbows swinging forward", () => {
    const ids = issuesFor("curl", { arms: { flexion: 50, elbow: 100 } }, { yaw: 0 }).map((i) => i.id);
    expect(ids).toContain("elbow_drift");
  });

  it("lateral raise: flags raising above shoulder height", () => {
    const ids = issuesFor("lateral_raise", { arms: { abduction: 140, elbow: 15 } }, { yaw: 0 }).map((i) => i.id);
    expect(ids).toContain("too_high");
  });

  it("jumping jack: flags feet not going wide", () => {
    const ids = issuesFor("jumping_jack", { scale: 0.34, arms: { abduction: 150, elbow: 10 } }, { yaw: 0 }).map((i) => i.id);
    expect(ids).toContain("feet_narrow");
  });
});

describe("plank hold", () => {
  it("times the hold and stops when the user stands up", () => {
    const rand = mulberry32(8);
    const session = new WorkoutSession({ exercise: "plank" });
    const plank = { yaw: 90, pitch: 82, baseLean: 0, arms: { flexion: 90, elbow: 90, bend: "up" }, noise: 0.003, rand };
    let state;
    let t = 0;
    for (let i = 0; i < 300; i++) state = session.processFrame(synthPose(0, plank), (t += 33)); // ~10 s
    expect(state.hold.holding).toBe(true);
    expect(state.hold.currentMs).toBeGreaterThan(9000);
    expect(state.hold.goodFormMs).toBeGreaterThan(9000);

    for (let i = 0; i < 10; i++) state = session.processFrame(synthPose(0, { yaw: 90, rand }), (t += 33));
    expect(state.hold.holding).toBe(false);
    expect(state.hold.bestMs).toBeGreaterThan(9000);
  });
});
