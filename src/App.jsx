import { useState } from "react";

import PlanBuilder from "./components/PlanBuilder";
import WorkoutPlayer from "./components/WorkoutPlayer";
import WorkoutSummary from "./components/WorkoutSummary";
import HistoryView from "./components/HistoryView";
import WorkoutView from "./components/WorkoutView";
import { loadHistory, addWorkout, historyStats, loadProfile, saveProfile } from "./engine/history";

const TABS = [
  { id: "plan", label: "My workout" },
  { id: "practice", label: "Free practice" },
  { id: "history", label: "History" },
];

function App() {
  const [tab, setTab] = useState("plan");
  const [profile, setProfile] = useState(() => ({ model: "full", ...loadProfile() }));
  const [history, setHistory] = useState(loadHistory);
  const [activePlan, setActivePlan] = useState(null);
  const [summary, setSummary] = useState(null);

  function updateProfile(next) {
    setProfile(next);
    saveProfile(next);
  }

  function finishWorkout(result) {
    setActivePlan(null);
    // Nothing was done: don't clutter the history
    if (result.sets.length === 0) return;
    setHistory(addWorkout(result));
    setSummary(result);
  }

  let content;
  if (activePlan) {
    content = (
      <WorkoutPlayer
        plan={activePlan}
        profile={profile}
        onFinish={finishWorkout}
        onExit={() => {
          if (window.confirm("Leave this workout without saving it?")) setActivePlan(null);
        }}
      />
    );
  } else if (summary) {
    content = (
      <WorkoutSummary
        summary={summary}
        bests={historyStats(history).bests}
        onDone={() => setSummary(null)}
        onHistory={() => {
          setSummary(null);
          setTab("history");
        }}
      />
    );
  } else if (tab === "plan") {
    content = <PlanBuilder profile={profile} onProfileChange={updateProfile} onStart={setActivePlan} />;
  } else if (tab === "practice") {
    content = <WorkoutView />;
  } else {
    content = <HistoryView history={history} onChange={setHistory} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>PostureVision</h1>
        <p className="muted">Real-time workout coach · runs entirely in your browser</p>
        {!activePlan && !summary && (
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab ${tab === t.id ? "selected" : ""}`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main>{content}</main>
    </div>
  );
}

export default App;
