import WorkoutView from "./components/WorkoutView";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>PostureVision</h1>
        <p className="muted">Real-time workout coach · runs entirely in your browser</p>
      </header>
      <main>
        <WorkoutView />
      </main>
    </div>
  );
}

export default App;
