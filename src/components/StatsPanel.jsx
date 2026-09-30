const STATUS_TEXT = {
  no_person: "Step into the frame",
  adjust: "Move back so your whole body, shoulders to ankles, is in view",
  calibrating: "Stand tall and hold still to calibrate",
  active: null,
};

const PHASE_TEXT = {
  standing: "Ready",
  descending: "Going down",
  ascending: "Coming up",
};

const VIEW_TEXT = {
  front: "Front view",
  side: "Side view",
  angled: "Angled view",
};

function scoreClass(score) {
  if (score === null || score === undefined) return "";
  if (score >= 85) return "good";
  if (score >= 60) return "warning";
  return "error";
}

export default function StatsPanel({ state }) {
  if (!state) {
    return (
      <section className="panel stats">
        <p className="muted">Waiting for the camera…</p>
      </section>
    );
  }

  const statusText = STATUS_TEXT[state.status];
  const progress = state.status === "active" ? state.progress : 0;

  return (
    <section className="panel stats">
      <div className="stat-row">
        <div className="stat stat-reps">
          <span className="stat-value">{state.reps}</span>
          <span className="stat-label">Reps</span>
        </div>
        <div className={`stat ${scoreClass(state.formScore)}`}>
          <span className="stat-value">{state.formScore ?? "–"}</span>
          <span className="stat-label">Form score</span>
        </div>
        <div className="stat">
          <span className="stat-value">{state.partialReps}</span>
          <span className="stat-label">Not counted</span>
        </div>
      </div>

      {statusText ? (
        <p className="status-banner">
          {statusText}
          {state.status === "calibrating" && ` (${Math.round(state.calibrationProgress * 100)}%)`}
        </p>
      ) : (
        <p className="phase">{PHASE_TEXT[state.phase]}</p>
      )}

      <div className="depth" aria-label="Squat depth">
        <div className="depth-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <dl className="meta">
        <div>
          <dt>{state.angleLabel ?? "Angle"}</dt>
          <dd>{Number.isFinite(state.angle) ? `${Math.round(state.angle)}°` : "–"}</dd>
        </div>
        <div>
          <dt>Camera</dt>
          <dd>{state.metrics ? VIEW_TEXT[state.metrics.view] : "–"}</dd>
        </div>
        <div>
          <dt>Tracking</dt>
          <dd>{state.metrics ? (state.metrics.uses3D ? "3D" : "2D") : "–"} · {state.fps ?? 0} fps</dd>
        </div>
        <div>
          <dt>Avg rep score</dt>
          <dd>{state.averageFormScore ?? "–"}</dd>
        </div>
      </dl>
    </section>
  );
}
