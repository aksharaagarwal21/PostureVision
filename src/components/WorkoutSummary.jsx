import { getExercise } from "../engine/exercises";
import { formatDuration } from "../engine/workoutPlan";

function Tile({ value, label, className = "" }) {
  return (
    <div className={`stat ${className}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function ExerciseResults({ exercises, bests = {} }) {
  return (
    <table className="history">
      <thead>
        <tr>
          <th>Exercise</th>
          <th>Sets</th>
          <th>Result</th>
          <th>Best set</th>
          <th>Form</th>
        </tr>
      </thead>
      <tbody>
        {exercises.map((e) => {
          const hold = getExercise(e.exerciseId).kind === "hold";
          const newBest = hold
            ? e.bestHoldMs > 0 && e.bestHoldMs >= (bests[e.exerciseId]?.bestHoldMs ?? Infinity)
            : e.bestSetReps > 0 && e.bestSetReps >= (bests[e.exerciseId]?.bestSetReps ?? Infinity);
          return (
            <tr key={e.exerciseId}>
              <td>{getExercise(e.exerciseId).name}</td>
              <td>{e.sets}</td>
              <td>{hold ? `${Math.round(e.holdMs / 1000)} s held` : `${e.reps} reps`}</td>
              <td>
                {hold ? `${Math.round(e.bestHoldMs / 1000)} s` : e.bestSetReps}
                {newBest && <span className="badge best">Best</span>}
              </td>
              <td>{e.avgFormScore ?? "–"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// bests: personal bests from history *including* this workout
export default function WorkoutSummary({ summary, bests, onDone, onHistory }) {
  const completedAll = summary.setsCompleted === summary.setsPlanned;

  return (
    <div className="summary">
      <section className="panel">
        <h2 className="summary-title">{completedAll ? "Workout complete!" : "Workout saved"}</h2>
        <p className="muted">
          {summary.planName} · {new Date(summary.startedAt).toLocaleString()}
        </p>
        <div className="summary-tiles">
          <Tile value={formatDuration(summary.durationMs / 1000)} label="Total time" />
          <Tile value={formatDuration(summary.activeMs / 1000)} label="Exercise time" />
          <Tile value={`~${Math.round(summary.kcal)}`} label="Calories (kcal)" />
          <Tile value={summary.totalReps} label="Total reps" />
          <Tile value={`${summary.setsCompleted}/${summary.setsPlanned}`} label="Sets completed" />
          <Tile value={summary.avgFormScore ?? "–"} label="Avg form score" />
        </div>
      </section>

      {summary.exercises.length > 0 && (
        <section className="panel">
          <h2>Your performance</h2>
          <ExerciseResults exercises={summary.exercises} bests={bests} />
          <p className="muted small">Calories are an estimate based on your body weight and exercise time.</p>
        </section>
      )}

      <div className="summary-actions">
        <button type="button" className="primary big" onClick={onDone}>
          Back to my plan
        </button>
        <button type="button" className="secondary" onClick={onHistory}>
          View history
        </button>
      </div>
    </div>
  );
}
