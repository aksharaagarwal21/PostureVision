import { describe, it, expect } from "vitest";
import {
  calculateAngle,
  calculateAngle3D,
  angleFromVertical,
  visibilityWeighted,
} from "../src/engine/angleUtils";

describe("calculateAngle", () => {
  it("measures a right angle", () => {
    expect(calculateAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });

  it("measures a straight line as 180 degrees", () => {
    expect(calculateAngle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(180);
  });

  it("never returns NaN from floating point drift", () => {
    const a = { x: 0.1, y: 0.1 };
    const b = { x: 0.2, y: 0.2 };
    const c = { x: 0.30000000000000004, y: 0.30000000000000004 };
    expect(Number.isNaN(calculateAngle(a, b, c))).toBe(false);
  });

  it("returns NaN for a zero-length segment instead of garbage", () => {
    expect(calculateAngle({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNaN();
  });
});

describe("calculateAngle3D", () => {
  it("sees an angle that is hidden in 2D", () => {
    // Bent towards the camera: flat in x/y, 90 degrees in 3D
    const hip = { x: 0, y: -1, z: 0 };
    const knee = { x: 0, y: 0, z: 0 };
    const ankle = { x: 0, y: 0, z: -1 };
    expect(calculateAngle3D(hip, knee, ankle)).toBeCloseTo(90);
  });
});

describe("angleFromVertical", () => {
  it("is 0 for an upright segment and 90 for a horizontal one", () => {
    expect(angleFromVertical({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0);
    expect(angleFromVertical({ x: 1, y: 1 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });
});

describe("visibilityWeighted", () => {
  it("trusts the more visible side", () => {
    expect(visibilityWeighted(90, 0.9, 150, 0.1)).toBeCloseTo(96);
  });

  it("falls back to the only usable side", () => {
    expect(visibilityWeighted(NaN, 0.9, 120, 0.8)).toBe(120);
  });
});
