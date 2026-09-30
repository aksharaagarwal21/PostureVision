// Decides when to offer "add to home screen" and keeps hold of Chrome's
// install prompt. Chrome fires `beforeinstallprompt` once, often before
// React has mounted, so it is captured as early as possible in main.jsx.

const DISMISS_KEY = "posturevision:installDismissedAt";
// After "Skip", ask again only after this long
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

// "ios" | "android" | "other"
export function detectPlatform(userAgent = "", maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS reports itself as a Mac, but Macs have no touch screen
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

// True when the app is already running from the home screen
export function isStandalone(win = globalThis.window) {
  if (!win) return false;
  if (win.navigator?.standalone === true) return true;
  return win.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function shouldShowInstall({ platform, standalone, dismissedAt, now = Date.now() }) {
  if (standalone) return false;
  if (platform !== "ios" && platform !== "android") return false;
  return !dismissedAt || now - dismissedAt >= SNOOZE_MS;
}

export function loadDismissedAt() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveDismissedAt(time = Date.now()) {
  try {
    localStorage.setItem(DISMISS_KEY, String(time));
  } catch {
    // Storage blocked: the banner just comes back next visit
  }
}

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function captureInstallPrompt(win = window) {
  win.addEventListener("beforeinstallprompt", (event) => {
    // Stop Chrome's own mini-infobar; we show our banner instead
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  win.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export const canPromptInstall = () => deferredPrompt !== null;
export const wasInstalled = () => installed;

export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Opens Chrome's install dialog. Resolves to "accepted" or "dismissed".
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  // The event can only be used once
  deferredPrompt = null;
  notify();
  event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}
