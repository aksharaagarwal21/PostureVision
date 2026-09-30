import { describe, it, expect } from "vitest";
import {
  computeSquatMetrics,
  SquatPostureAnalyzer,
  View,
  reviewRep,
} from "../src/engine/postureAnalyzer";
import { synthPose, kneeAngleForDepth, mulberry32 } from "./synthetic";

function issuesFor(pose, frames = 6) {
  const analyzer = new SquatPostureAnalyzer();
  const m = computeSquatMetrics(pose.landmarks, pose.world);
  let result;
  for (let i = 0; i < frames; i++) result = analyzer.analyze(m, { inRep: true });
  return result.issues.map((i) => i.id);
}

describe("computeSquatMetrics", () => {
  it("detects the camera view", () => {
    expect(computeSquatMetrics(synthPose(0, { yaw: 0 }).landmarks).view).toBe(View.FRONT);
    expect(computeSquatMetrics(synthPose(0, { yaw: 90 }).landmarks).view).toBe(View.SIDE);
    expect(computeSquatMetrics(synthPose(0, { yaw: -90 }).landmarks).view).toBe(View.SIDE);
  });

  it("measures the knee angle accurately from any view with 3D landmarks", () => {
    for (const yaw of [0, 30, 60, 90, -90]) {
      for (const depth of [0.3, 0.6, 1]) {
        const pose = synthPose(depth, { yaw });
        const m = computeSquatMetrics(pose.landmarks, pose.world);
        expect(Math.abs(m.kneeAngle - kneeAngleForDepth(depth))).toBeLessThan(4);
      }
    }
  });

  it("shows why 2D angles fail from the front", () => {
    // The legacy 2D approach sees a deep squat as nearly straight legs
    const pose = synthPose(1, { yaw: 0 });
    const m2d = computeSquatMetrics(pose.landmarks);
    expect(m2d.kneeAngle).toBeGreaterThan(140);
  });

  it("uses the leg nearest the camera in side view", () => {
    const facingRight = computeSquatMetrics(synthPose(0.5, { yaw: 90 }).landmarks);
    const facingLeft = computeSquatMetrics(synthPose(0.5, { yaw: -90 }).landmarks);
    expect(facingRight.nearSide).toBe("right");
    expect(facingLeft.nearSide).toBe("left");
  });

  it("stays usable in side view when the far leg is hidden", () => {
    expect(computeSquatMetrics(synthPose(0.5, { yaw: 90 }).landmarks).bodyVisible).toBe(true);
  });
});

describe("SquatPostureAnalyzer", () => {
  it("gives no errors for good form from the front or side", () => {
    for (const yaw of [0, 90]) {
      const errors = issuesFor(synthPose(0.9, { yaw }));
      expect(errors).toEqual([]);
    }
  });

  it("flags excessive forward lean", () => {
    expect(issuesFor(synthPose(0.9, { yaw: 90, extraLean: 35 }))).toContain("torso_lean");
    // Also visible from the front thanks to 3D landmarks
    expect(issuesFor(synthPose(0.9, { yaw: 0, extraLean: 35 }))).toContain("torso_lean");
  });

  it("flags knees caving in from the front", () => {
    expect(issuesFor(synthPose(0.9, { yaw: 0, valgus: 1.3 }))).toContain("knee_valgus");
  });

  it("reports which joints to mark for a mistake", () => {
    const analyzer = new SquatPostureAnalyzer();
    const pose = synthPose(0.9, { yaw: 0, valgus: 1.3 });
    const m = computeSquatMetrics(pose.landmarks, pose.world);
    let result;
    for (let i = 0; i < 6; i++) result = analyzer.analyze(m, { inRep: true });
    const valgus = result.issues.find((i) => i.id === "knee_valgus");
    expect(valgus.joints).toEqual([25, 26]);
    expect(valgus.voice).toBe("Push your knees out");
  });

  it("flags heels lifting in side view", () => {
    const analyzer = new SquatPostureAnalyzer();
    analyzer.calibrate(computeSquatMetrics(synthPose(0, { yaw: 90 }).landmarks));
    const m = computeSquatMetrics(synthPose(0.9, { yaw: 90, heelLift: 0.08 }).landmarks);
    let result;
    for (let i = 0; i < 6; i++) result = analyzer.analyze(m, { inRep: true });
    expect(result.issues.map((i) => i.id)).toContain("heel_lift");
  });

  it("does not flicker on a single bad frame", () => {
    const analyzer = new SquatPostureAnalyzer();
    const good = computeSquatMetrics(synthPose(0.9, { yaw: 90 }).landmarks);
    const bad = computeSquatMetrics(synthPose(0.9, { yaw: 90, extraLean: 40 }).landmarks);
    for (let i = 0; i < 5; i++) analyzer.analyze(good, { inRep: true });
    const result = analyzer.analyze(bad, { inRep: true });
    expect(result.issues).toEqual([]);
  });

  it("keeps false alarms rare on noisy good-form squats", () => {
    const rand = mulberry32(3);
    const analyzer = new SquatPostureAnalyzer();
    let flagged = 0;
    const frames = 400;
    for (let i = 0; i < frames; i++) {
      const depth = 0.5 + 0.5 * rand();
      const pose = synthPose(depth, { yaw: rand() < 0.5 ? 0 : 90, noise: 0.004, worldNoise: 0.01, rand });
      const result = analyzer.analyze(computeSquatMetrics(pose.landmarks, pose.world), { inRep: true });
      if (result.issues.some((x) => x.severity === "error")) flagged += 1;
    }
    expect(flagged / frames).toBeLessThan(0.02);
  });
});

describe("reviewRep", () => {
  it("asks for more depth on reps above parallel", () => {
    const review = reviewRep({ counted: true, depth: "above parallel", durationMs: 2000 });
    expect(review.cues[0].message).toMatch(/deeper/);
    expect(review.score).toBe(85);
  });
});
