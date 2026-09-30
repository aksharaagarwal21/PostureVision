const STATUS_TEXT = {
  no_person: "Step into the frame",
  adjust: "Adjust your position so your whole body is in view",
  calibrating: "Hold still in the start position to calibrate",
  active: null,
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

function formatTime(ms) {
  const total = Math.floor((ms ?? 0) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function phaseText(state, exercise) {
  if (state.kind === "hold") return state.hold?.holding ? "Holding" : "Get into position";
  if (state.phase === "descending") return `Going to: ${exercise.labels.active.toLowerCase()}`;
  if (state.phase === "ascending") return `Back to: ${exercise.labels.rest.toLowerCase()}`;
  return "Ready";
}

export default function StatsPanel({ state, exercise }) {
  if (!state) {
    return (
      <section className="panel stats">
        <p className="muted">Waiting for the camera…</p>
      </section>
    );
  }

  const isHold = state.kind === "hold";
  const statusText = state.status === "active" ? null : state.message ?? STATUS_TEXT[state.status];
  const progress = state.status === "active" ? state.progress : 0;
  const goodPct = isHold && state.hold.totalMs > 0
    ? Math.round((100 * state.hold.goodFormMs) / state.hold.totalMs)
    : null;

  return (
    <section className="panel stats">
      <div className="stat-row">
        {isHold ? (
          <>
            <div className="stat stat-reps">
              <span className="stat-value">{formatTime(state.hold.currentMs)}</span>
              <span className="stat-label">Hold</span>
            </div>
            <div className={`stat ${scoreClass(state.formScore)}`}>
              <span className="stat-value">{state.formScore ?? "–"}</span>
              <span className="stat-label">Form score</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatTime(state.hold.bestMs)}</span>
              <span className="stat-label">Best hold</span>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {statusText ? (
        <p className="status-banner">
          {statusText}
          {state.status === "calibrating" && ` (${Math.round(state.calibrationProgress * 100)}%)`}
        </p>
      ) : (
        <p className="phase">{phaseText(state, exercise)}</p>
      )}

      {!isHold && (
        <div className="depth" aria-label="Range of motion">
          <div className="depth-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

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
          <dt>{isHold ? "Good form time" : "Avg rep score"}</dt>
          <dd>{isHold ? (goodPct === null ? "–" : `${goodPct}%`) : state.averageFormScore ?? "–"}</dd>
        </div>
      </dl>
    </section>
  );
}
