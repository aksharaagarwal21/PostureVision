import { useState } from "react";

import ExerciseGuide from "./ExerciseGuide";
import { EXERCISES, CATEGORIES } from "../engine/exercises";

export default function ExercisePicker({ value, onChange }) {
  const [showGuide, setShowGuide] = useState(false);
  const [category, setCategory] = useState("all");
  const selected = EXERCISES.find((e) => e.id === value) ?? EXERCISES[0];
  const shown = category === "all" ? EXERCISES : EXERCISES.filter((e) => e.categories.includes(category));

  return (
    <section className="panel picker">
      <div className="category-filter" role="radiogroup" aria-label="Category">
        {[{ id: "all", name: "All" }, ...CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            className={category === c.id ? "selected" : ""}
            onClick={() => setCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="picker-grid" role="radiogroup" aria-label="Exercise">
        {shown.map((ex) => (
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
      <p className="muted small">
        Camera: {selected.camera} ·{" "}
        <button type="button" className="link-button" onClick={() => setShowGuide((v) => !v)}>
          {showGuide ? "Hide how-to" : "How to do it"}
        </button>
      </p>
      {showGuide && <ExerciseGuide exerciseId={selected.id} />}
    </section>
  );
}
