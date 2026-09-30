// Turns WorkoutRunner events into spoken announcements: set start, countdowns,
// rest breaks, what's next and the end of the workout.

import { getExercise } from "./exercises";
import { describeTarget } from "./workoutPlan";

const name = (step) => getExercise(step.exerciseId).name;

// Returns [{ text, interrupt, queue }] for one batch of runner events
export function announce(events) {
  const out = [];
  const say = (text, opts = {}) => out.push({ text, interrupt: false, queue: true, ...opts });

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const step = event.step;

    switch (event.type) {
      case "get_ready":
        if (step.set === 1) {
          say(`Get ready. ${name(step)}. ${step.totalSets} ${step.totalSets === 1 ? "set" : "sets"} of ${describeTarget(step)}.`, {
            interrupt: true,
            queue: false,
          });
        } else {
          say(`Get ready for set ${step.set} of ${step.totalSets}.`);
        }
        break;

      case "work":
        say(step.targetType === "time" ? `Go! ${step.seconds} seconds.` : "Go!", { interrupt: true, queue: false });
        break;

      case "tick":
        if (event.secondsLeft <= 3) {
          say(String(event.secondsLeft), { interrupt: true, queue: false });
        } else if (event.phase === "rest" && event.secondsLeft === 10) {
          say("10 seconds left");
        }
        break;

      case "halfway":
        say("Halfway there");
        break;

      case "rest": {
        const previous = events.slice(0, i).reverse().find((e) => e.type === "set_complete")?.result;
        let text = `Set complete. Rest ${event.durationSec} seconds.`;
        if (previous && previous.exerciseId !== step.exerciseId) {
          text += ` Next up: ${name(step)}, ${describeTarget(step)}.`;
        }
        say(text);
        break;
      }

      case "done": {
        const s = event.summary;
        const kcal = Math.round(s.kcal);
        say(
          s.totalReps > 0
            ? `Workout complete! Great job. You did ${s.totalReps} reps and burned about ${kcal} calories.`
            : `Workout complete! Great job. You burned about ${kcal} calories.`
        );
        break;
      }

      default:
        break;
    }
  }
  return out;
}
