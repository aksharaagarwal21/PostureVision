export default function FeedbackPanel({ state }) {
  const issues = state?.issues ?? [];
  const cues = state?.cues ?? [];
  const items = [...issues, ...cues];

  return (
    <section className="panel">
      <h2>Form feedback</h2>
      {items.length === 0 ? (
        <p className="muted">
          {state?.status === "active" ? "Looking good. Keep going!" : "Feedback appears once you start squatting."}
        </p>
      ) : (
        <ul className="feedback">
          {items.map((item, i) => (
            <li key={`${item.id ?? item.message}-${i}`} className={`feedback-item ${item.severity}`}>
              {item.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
