// Persists trained models in the browser. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded.

const PREFIX = "posturevision:";

export function saveModel(name, model) {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify(model));
    return true;
  } catch {
    return false;
  }
}

export function loadModel(name) {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deleteModel(name) {
  try {
    localStorage.removeItem(PREFIX + name);
  } catch {
    // Nothing to clean up
  }
}
