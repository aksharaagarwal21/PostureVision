import { useState, useSyncExternalStore } from "react";

import {
  canPromptInstall,
  detectPlatform,
  isStandalone,
  loadDismissedAt,
  promptInstall,
  saveDismissedAt,
  shouldShowInstall,
  subscribeInstall,
  wasInstalled,
} from "../pwa/installPrompt";

const ICON = `${import.meta.env.BASE_URL}icon-192.png`;

// The iOS "Share" glyph, so people know which button to look for
function ShareIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function initialState() {
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  const open = shouldShowInstall({ platform, standalone: isStandalone(), dismissedAt: loadDismissedAt() });
  return { platform, open };
}

// Bottom banner on phones: "Install" on Android, Share → Add to Home Screen on iPhone
export default function InstallBanner({ hidden = false }) {
  const [{ platform, open }, setState] = useState(initialState);
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall);
  const installed = useSyncExternalStore(subscribeInstall, wasInstalled);

  if (!open || hidden || installed) return null;

  const close = () => setState((s) => ({ ...s, open: false }));
  const skip = () => {
    saveDismissedAt();
    close();
  };
  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "dismissed") saveDismissedAt();
    close();
  };

  let hint;
  if (platform === "ios") {
    hint = (
      <>
        Tap <ShareIcon /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </>
    );
  } else if (!canPrompt) {
    hint = (
      <>
        Tap <strong>⋮</strong> in your browser, then <strong>Install app</strong> or <strong>Add to Home screen</strong>.
      </>
    );
  } else {
    hint = "Open it from your home screen, full screen, like any other app.";
  }

  return (
    <>
      {/* Lets the page scroll past the banner, so nothing stays hidden under it */}
      <div className="install-spacer" aria-hidden="true" />
      <aside className="install-banner" aria-label="Install PostureVision">
        <img className="install-icon" src={ICON} alt="" width="48" height="48" />
        <div className="install-text">
          <strong>Add PostureVision to your home screen</strong>
          <p className="muted small">{hint}</p>
        </div>
        <div className="install-actions">
          {platform === "android" && canPrompt && (
            <button type="button" className="primary" onClick={install}>
              Install
            </button>
          )}
          <button type="button" className="secondary" onClick={skip}>
            Skip
          </button>
        </div>
      </aside>
    </>
  );
}
