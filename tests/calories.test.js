import { describe, it, expect } from "vitest";
import { kcal, exerciseCalories, restCalories, DEFAULT_WEIGHT_KG } from "../src/engine/calories";

describe("calories", () => {
  it("uses MET x kg x hours", () => {
    // 8 MET for 30 minutes at 70 kg = 280 kcal
    expect(kcal(8, 70, 30 * 60 * 1000)).toBeCloseTo(280);
  });

  it("falls back to a default weight", () => {
    expect(kcal(4, 0, 3_600_000)).toBeCloseTo(4 * DEFAULT_WEIGHT_KG);
  });

  it("burns more doing jumping jacks than resting", () => {
    const minute = 60_000;
    expect(exerciseCalories("jumping_jack", 70, minute)).toBeGreaterThan(restCalories(70, minute) * 4);
  });

  it("is zero for no time", () => {
    expect(exerciseCalories("squat", 70, 0)).toBe(0);
  });
});
