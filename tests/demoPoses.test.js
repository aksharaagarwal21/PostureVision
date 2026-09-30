import { describe, it, expect } from "vitest";
import { demoPose, demoBounds, hasDemo } from "../src/demo/demoPoses";
import { demoPhase } from "../src/demo/drawDemo";
import { EXERCISES } from "../src/engine/exercises";
import { GUIDES } from "../src/content/exerciseGuides";

const points = (pose) => [pose.head, pose.neck, ...Object.values(pose.near), ...Object.values(pose.far)];

describe("exercise demos", () => {
  it.each(EXERCISES.map((e) => [e.id]))("%s has a demo that stays on or above the floor", (id) => {
    expect(hasDemo(id)).toBe(true);
    for (let i = 0; i <= 20; i++) {
      for (const [x, y] of points(demoPose(id, i / 20))) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(y).toBeGreaterThan(-0.01);
      }
    }
    const b = demoBounds(id);
    expect(b.maxX).toBeGreaterThan(b.minX);
  });

  it.each(EXERCISES.map((e) => [e.id]))("%s has step-by-step instructions", (id) => {
    const guide = GUIDES[id];
    expect(guide.steps.length).toBeGreaterThanOrEqual(3);
    expect(guide.tips.length).toBeGreaterThan(0);
    for (const step of guide.steps) expect(step.t).toBeGreaterThanOrEqual(0);
  });

  it("animates from start to end and back", () => {
    expect(demoPhase(0, 1000)).toBe(0);
    expect(demoPhase(550, 1000)).toBe(1);
    expect(demoPhase(999, 1000)).toBeLessThan(0.01);
  });
});
