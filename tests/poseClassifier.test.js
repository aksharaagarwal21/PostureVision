import { describe, it, expect } from "vitest";
import { PoseClassifier } from "../src/engine/poseClassifier";
import { synthPose, mulberry32 } from "./synthetic";

function sample(label, rand, yaw = 90) {
  const depth = label === "up" ? rand() * 0.12 : 0.75 + rand() * 0.25;
  return synthPose(depth, { yaw, noise: 0.006, rand, scale: 0.35 + rand() * 0.15 });
}

function train(rand, perLabel = 20, yaw = 90) {
  const clf = new PoseClassifier();
  for (let i = 0; i < perLabel; i++) {
    clf.addSample("up", sample("up", rand, yaw).landmarks, { kneeAngle: 170 });
    clf.addSample("down", sample("down", rand, yaw).landmarks, { kneeAngle: 90 });
  }
  return clf;
}

describe("PoseClassifier", () => {
  it("is not usable until each label has enough samples", () => {
    const clf = new PoseClassifier({ minSamplesPerLabel: 5 });
    const rand = mulberry32(1);
    for (let i = 0; i < 5; i++) clf.addSample("up", sample("up", rand).landmarks);
    expect(clf.isTrained).toBe(false);
    expect(clf.classify(sample("up", rand).landmarks)).toBeNull();
  });

  it("reaches high leave-one-out accuracy", () => {
    const clf = train(mulberry32(2));
    expect(clf.evaluate().accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("classifies unseen poses, including the mirrored direction", () => {
    const rand = mulberry32(3);
    const clf = train(rand, 20, 90);
    let correct = 0;
    const total = 200;
    for (let i = 0; i < total; i++) {
      const label = i % 2 ? "up" : "down";
      // Trained facing right, tested facing left
      const result = clf.classify(sample(label, rand, -90).landmarks);
      if (result.label === label) correct += 1;
    }
    expect(correct / total).toBeGreaterThanOrEqual(0.95);
  });

  it("removes mislabelled samples as outliers", () => {
    const rand = mulberry32(4);
    const clf = train(rand);
    // Accidentally recorded while standing
    for (let i = 0; i < 3; i++) clf.addSample("down", sample("up", rand).landmarks);
    expect(clf.removeOutliers()).toBeGreaterThanOrEqual(3);
  });

  it("exposes median measurements for calibration", () => {
    const clf = train(mulberry32(5));
    expect(clf.medianMeta("up", "kneeAngle")).toBe(170);
    expect(clf.medianMeta("down", "kneeAngle")).toBe(90);
  });

  it("survives a JSON round trip", () => {
    const rand = mulberry32(6);
    const clf = train(rand);
    const restored = PoseClassifier.fromJSON(JSON.parse(JSON.stringify(clf.toJSON())));
    const pose = sample("down", rand).landmarks;
    expect(restored.classify(pose).label).toBe(clf.classify(pose).label);
    expect(restored.counts).toEqual(clf.counts);
  });
});
