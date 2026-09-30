import { describe, it, expect } from "vitest";
import { VoiceCoach } from "../src/engine/voiceCoach";
import { getExercise } from "../src/engine/exercises";

function setup() {
  const said = [];
  const coach = new VoiceCoach((text) => {
    said.push(text);
    return true;
  });
  return { coach, said };
}

const squat = getExercise("squat");
const active = (extra = {}) => ({ status: "active", issues: [], reps: 0, ...extra });
const rep = (extra = {}) => ({ counted: true, reachedTarget: true, issues: [], ...extra });

describe("VoiceCoach", () => {
  it("says the rep count with a verdict on each rep", () => {
    const { coach, said } = setup();
    coach.update(active(), squat, 0);
    coach.update(active({ reps: 1, event: { type: "rep", rep: rep() } }), squat, 1000);
    coach.update(active({ reps: 2, event: { type: "rep", rep: rep({ reachedTarget: false }) } }), squat, 3000);
    coach.update(
      active({ reps: 3, event: { type: "rep", rep: rep({ issues: [{ id: "torso_lean", voice: "Chest up" }] }) } }),
      squat,
      5000
    );
    expect(said).toEqual(["Ready. Start now", "1. Good rep", "2. Go deeper", "3. Chest up"]);
  });

  it("explains reps that were not counted", () => {
    const { coach, said } = setup();
    coach.update(active(), squat, 0);
    coach.update(
      active({ event: { type: "partial", rep: { counted: false, reason: "not enough range of motion" } } }),
      squat,
      1000
    );
    expect(said.at(-1)).toBe("Not counted. Go deeper");
  });

  it("calls out a live form mistake once, not every frame", () => {
    const { coach, said } = setup();
    coach.update(active(), squat, 0);
    const issue = { id: "knee_valgus", severity: "error", voice: "Push your knees out" };
    for (let t = 2000; t < 4000; t += 100) coach.update(active({ issues: [issue] }), squat, t);
    expect(said.filter((s) => s === "Push your knees out")).toHaveLength(1);
  });

  it("repeats a mistake that keeps happening after the cooldown", () => {
    const { coach, said } = setup();
    coach.update(active(), squat, 0);
    const issue = { id: "knee_valgus", severity: "error", voice: "Push your knees out" };
    for (let t = 2000; t < 9000; t += 100) coach.update(active({ issues: [issue] }), squat, t);
    expect(said.filter((s) => s === "Push your knees out")).toHaveLength(2);
  });

  it("helps with positioning after a short delay", () => {
    const { coach, said } = setup();
    const adjust = { status: "adjust", message: "Step into the frame" };
    coach.update(adjust, squat, 0);
    coach.update(adjust, squat, 1000);
    expect(said).toEqual([]);
    coach.update(adjust, squat, 3000);
    expect(said).toEqual(["Step into the frame"]);
  });

  it("marks milestones", () => {
    const { coach, said } = setup();
    coach.update(active(), squat, 0);
    coach.update(active({ reps: 5, event: { type: "rep", rep: rep() } }), squat, 1000);
    expect(said.at(-1)).toMatch(/^5\. .*5 done, keep going$/);
  });

  it("counts out a plank hold every 10 seconds", () => {
    const { coach, said } = setup();
    const plank = getExercise("plank");
    coach.update(active({ hold: { holding: true, currentMs: 0 } }), plank, 0);
    for (let ms = 0; ms <= 21000; ms += 500) {
      coach.update(active({ hold: { holding: true, currentMs: ms } }), plank, ms + 100);
    }
    expect(said).toEqual(["Good. Hold your plank", "10 seconds", "20 seconds"]);
  });
});
