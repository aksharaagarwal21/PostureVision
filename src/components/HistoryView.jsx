import { useState } from "react";

import { ExerciseResults } from "./WorkoutSummary";
import { getExercise } from "../engine/exercises";
import { formatDuration } from "../engine/workoutPlan";
import { historyStats, deleteWorkout, clearHistory } from "../engine/history";

export default function HistoryView({ history, onChange }) {
  const [open, setOpen] = useState(null);
  const stats = historyStats(history);

  if (history.length === 0) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p className="muted">No workouts yet. Finish a workout and your results will show up here.</p>
      </section>
    );
  }

  const bests = Object.entries(stats.bests).filter(([, b]) => b.bestSetReps > 0 || b.bestHoldMs > 0);

  return (
    <div className="history-view">
      <section className="panel">
        <h2>Your progress</h2>
        <div className="summary-tiles">
          <div className="stat">
            <span className="stat-value">{stats.workouts}</span>
            <span className="stat-label">Workouts</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.thisWeek}</span>
            <span className="stat-label">This week</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.streakDays}</span>
            <span className="stat-label">Day streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatDuration(stats.totalMs / 1000)}</span>
            <span className="stat-label">Total time</span>
          </div>
          <div className="stat">
            <span className="stat-value">~{stats.totalKcal}</span>
            <span className="stat-label">Calories (kcal)</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.totalReps}</span>
            <span className="stat-label">Total reps</span>
          </div>
        </div>
      </section>

      {bests.length > 0 && (
        <section className="panel">
          <h2>Personal bests</h2>
          <ul className="bests">
            {bests.map(([id, b]) => {
              const hold = getExercise(id).kind === "hold";
              return (
                <li key={id}>
                  <span>{getExercise(id).name}</span>
                  <strong>{hold ? `${Math.round(b.bestHoldMs / 1000)} s hold` : `${b.bestSetReps} reps in a set`}</strong>
                  {!hold && <span className="muted small">{b.totalReps} reps in total</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Past workouts</h2>
        <ul className="workout-list">
          {history.map((w) => (
            <li key={w.startedAt} className="workout-entry">
              <button
                type="button"
                className="workout-entry-head"
                aria-expanded={open === w.startedAt}
                onClick={() => setOpen(open === w.startedAt ? null : w.startedAt)}
              >
                <span>
                  <strong>{w.planName}</strong>
                  <span className="muted small"> · {new Date(w.startedAt).toLocaleString()}</span>
                </span>
                <span className="small">
                  {formatDuration(w.durationMs / 1000)} · ~{Math.round(w.kcal)} kcal · {w.totalReps} reps
                  {w.avgFormScore != null && ` · form ${w.avgFormScore}`}
                </span>
              </button>
              {open === w.startedAt && (
                <div className="workout-entry-body">
                  <ExerciseResults exercises={w.exercises} />
                  <button
                    type="button"
                    className="link-button danger-text"
                    onClick={() => onChange(deleteWorkout(w.startedAt))}
                  >
                    Delete this workout
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (window.confirm("Delete all workout history? This can't be undone.")) onChange(clearHistory());
          }}
        >
          Clear history
        </button>
      </section>
    </div>
  );
}
