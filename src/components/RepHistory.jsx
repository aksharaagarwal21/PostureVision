export default function RepHistory({ history }) {
  const recent = (history ?? []).slice(-8).reverse();

  return (
    <section className="panel">
      <h2>Rep history</h2>
      {recent.length === 0 ? (
        <p className="muted">No reps yet.</p>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>#</th>
              <th>Depth</th>
              <th>Time</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((rep) => (
              <tr key={rep.endTime} className={rep.counted ? "" : "not-counted"}>
                <td>{rep.counted ? rep.index : "–"}</td>
                <td>
                  {Math.round(rep.depthAngle)}° <span className="muted">{rep.counted ? rep.depth : rep.reason}</span>
                </td>
                <td>{(rep.durationMs / 1000).toFixed(1)}s</td>
                <td>{rep.counted ? rep.formScore ?? "–" : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
