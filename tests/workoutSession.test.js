import { describe, it, expect } from "vitest";
import { SquatSession, Status } from "../src/engine/workoutSession";
import { synthPose, squatDepthTrace, mulberry32 } from "./synthetic";

function runSession(session, reps, { yaw, rand, noise = 0.004, worldNoise = 0.01, dropFrames = 0 }) {
  const frames = squatDepthTrace(reps);
  let state;
  for (const f of frames) {
    const lost = dropFrames > 0 && rand() < dropFrames;
    const pose = lost ? { landmarks: null, world: null } : synthPose(f.depth, { yaw, noise, worldNoise, rand });
    state = session.processFrame(pose, f.t);
  }
  return state;
}

describe("SquatSession", () => {
  it("goes through calibration before counting", () => {
    const session = new SquatSession();
    const rand = mulberry32(1);
    const first = session.processFrame(synthPose(0, { yaw: 0, rand }), 0);
    expect(first.status).toBe(Status.CALIBRATING);

    const state = runSession(session, [], { yaw: 0, rand });
    expect(state.status).toBe(Status.ACTIVE);
    expect(state.calibrated).toBe(true);
  });

  it("asks the user to step into frame when nobody is detected", () => {
    const session = new SquatSession();
    expect(session.processFrame({ landmarks: null }, 0).status).toBe(Status.NO_PERSON);
  });

  it.each([
    ["front", 0],
    ["angled", 45],
    ["side, facing right", 90],
    ["side, facing left", -90],
  ])("counts reps correctly from the %s view", (_, yaw) => {
    const session = new SquatSession();
    const rand = mulberry32(yaw + 100);
    const state = runSession(
      session,
      [
        { depth: 1, durationMs: 2000 },
        { depth: 0.85, durationMs: 1600 },
        { depth: 0.95, durationMs: 2600 },
        { depth: 0.9, durationMs: 1300 },
      ],
      { yaw, rand }
    );
    expect(state.reps).toBe(4);
  });

  it("stays accurate across many noisy sessions with dropped frames", () => {
    const rand = mulberry32(99);
    const sessions = 60;
    let exact = 0;

    for (let s = 0; s < sessions; s++) {
      const n = 2 + Math.floor(rand() * 6);
      const reps = Array.from({ length: n }, () => ({
        depth: 0.6 + rand() * 0.4,
        durationMs: 1000 + rand() * 2000,
        pauseMs: 300 + rand() * 900,
      }));
      const yaw = [0, 30, 60, 90, -90][s % 5];
      const state = runSession(new SquatSession(), reps, {
        yaw,
        rand,
        noise: 0.006,
        worldNoise: 0.015,
        dropFrames: 0.03,
      });
      if (state.reps === n) exact += 1;
    }

    expect(exact / sessions).toBeGreaterThanOrEqual(0.95);
  });

  it("records training samples and calibrates from them", () => {
    const session = new SquatSession();
    const rand = mulberry32(5);
    let t = 0;
    for (const [label, depth] of [["rest", 0.02], ["active", 0.9]]) {
      session.startRecording(label, 2000);
      for (let i = 0; i < 70; i++) {
        session.processFrame(synthPose(depth + rand() * 0.05, { yaw: 90, noise: 0.004, rand }), (t += 33));
      }
    }
    expect(session.classifier.isTrained).toBe(true);
    expect(session.recording).toBeNull();
    // Thresholds now come from the recorded up/down knee angles
    expect(session.counter.config.minRangeOfMotion).toBeGreaterThan(40);
  });

  it("starts a new set without losing calibration", () => {
    const session = new SquatSession();
    const rand = mulberry32(12);
    let state = runSession(session, [{ depth: 1, durationMs: 2000 }, { depth: 1, durationMs: 2000 }], { yaw: 0, rand });
    expect(state.reps).toBe(2);

    session.startSet();
    const frame = session.processFrame(synthPose(0, { yaw: 0, rand }), 99_000);
    expect(frame.reps).toBe(0);
    expect(frame.calibrated).toBe(true);
    expect(frame.status).toBe(Status.ACTIVE);
  });
});
