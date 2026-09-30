import { describe, it, expect } from "vitest";
import { historyStats } from "../src/engine/history";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 8, 30, 18, 0).getTime();

const workout = (daysAgo, extra = {}) => ({
  startedAt: now - daysAgo * DAY,
  durationMs: 20 * 60 * 1000,
  kcal: 100,
  totalReps: 50,
  exercises: [{ exerciseId: "squat", reps: 30, bestSetReps: 12, bestHoldMs: 0 }],
  ...extra,
});

describe("historyStats", () => {
  it("adds up totals and finds personal bests", () => {
    const stats = historyStats(
      [
        workout(0),
        workout(1, { exercises: [{ exerciseId: "squat", reps: 20, bestSetReps: 15 }, { exerciseId: "plank", reps: 0, bestHoldMs: 45000 }] }),
      ],
      now
    );
    expect(stats).toMatchObject({ workouts: 2, totalKcal: 200, totalReps: 100, thisWeek: 2 });
    expect(stats.bests.squat).toMatchObject({ bestSetReps: 15, totalReps: 50 });
    expect(stats.bests.plank.bestHoldMs).toBe(45000);
  });

  it("counts a day streak", () => {
    expect(historyStats([workout(0), workout(1), workout(2), workout(4)], now).streakDays).toBe(3);
    // Streak still counts if you haven't trained yet today
    expect(historyStats([workout(1), workout(2)], now).streakDays).toBe(2);
    expect(historyStats([workout(3)], now).streakDays).toBe(0);
  });

  it("handles an empty history", () => {
    expect(historyStats([], now)).toMatchObject({ workouts: 0, streakDays: 0, totalKcal: 0 });
  });
});
