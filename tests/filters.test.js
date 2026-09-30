import { describe, it, expect } from "vitest";
import { OneEuroFilter, StableFlag } from "../src/engine/filters";
import { mulberry32, gaussian } from "./synthetic";

function std(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

describe("OneEuroFilter", () => {
  it("removes most jitter from a still signal", () => {
    const rand = mulberry32(1);
    const filter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.02 });
    const raw = [];
    const smoothed = [];
    for (let i = 0; i < 300; i++) {
      const x = 170 + 3 * gaussian(rand);
      raw.push(x);
      smoothed.push(filter.filter(x, i * 33));
    }
    expect(std(smoothed.slice(30))).toBeLessThan(std(raw.slice(30)) * 0.5);
  });

  it("follows fast movement with little lag", () => {
    const filter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.02 });
    let out = 0;
    // 170 -> 90 degrees in half a second
    for (let i = 0; i <= 15; i++) out = filter.filter(170 - (80 * i) / 15, i * 33);
    for (let i = 16; i <= 20; i++) out = filter.filter(90, i * 33);
    expect(out).toBeLessThan(100);
  });
});

describe("StableFlag", () => {
  it("ignores single-frame blips", () => {
    const flag = new StableFlag(3, 3);
    expect(flag.update(true)).toBe(false);
    expect(flag.update(false)).toBe(false);
    expect(flag.update(true)).toBe(false);
    expect(flag.update(true)).toBe(false);
    expect(flag.update(true)).toBe(true);
  });
});
