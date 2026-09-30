import { EXERCISES } from "../engine/exercises";

export default function ExercisePicker({ value, onChange }) {
  const selected = EXERCISES.find((e) => e.id === value) ?? EXERCISES[0];

  return (
    <section className="panel picker">
      <div className="picker-grid" role="radiogroup" aria-label="Exercise">
        {EXERCISES.map((ex) => (
          <button
            key={ex.id}
            role="radio"
            aria-checked={ex.id === value}
            className={`picker-item ${ex.id === value ? "selected" : ""}`}
            onClick={() => onChange(ex.id)}
          >
            {ex.name}
          </button>
        ))}
      </div>
      <p className="picker-instructions">{selected.instructions}</p>
      <p className="muted small">Camera: {selected.camera}</p>
    </section>
  );
}
