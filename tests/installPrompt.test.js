import { describe, it, expect } from "vitest";
import { detectPlatform, isStandalone, shouldShowInstall, SNOOZE_MS } from "../src/pwa/installPrompt";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

describe("detectPlatform", () => {
  it("recognises phones", () => {
    expect(detectPlatform(IPHONE)).toBe("ios");
    expect(detectPlatform(ANDROID)).toBe("android");
  });

  it("treats a touch-screen 'Mac' as an iPad", () => {
    expect(detectPlatform(IPAD, 5)).toBe("ios");
    expect(detectPlatform(IPAD, 0)).toBe("other");
  });

  it("leaves desktops out", () => {
    expect(detectPlatform(WINDOWS)).toBe("other");
    expect(detectPlatform()).toBe("other");
  });
});

describe("isStandalone", () => {
  const win = (standaloneMedia, iosStandalone) => ({
    navigator: { standalone: iosStandalone },
    matchMedia: () => ({ matches: standaloneMedia }),
  });

  it("detects the installed app", () => {
    expect(isStandalone(win(true, undefined))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    expect(isStandalone(win(false, undefined))).toBe(false);
    expect(isStandalone(undefined)).toBe(false);
  });
});

describe("shouldShowInstall", () => {
  const now = 1_000_000_000_000;

  it("shows on phones that haven't installed or skipped", () => {
    expect(shouldShowInstall({ platform: "android", standalone: false, dismissedAt: 0, now })).toBe(true);
    expect(shouldShowInstall({ platform: "ios", standalone: false, dismissedAt: 0, now })).toBe(true);
  });

  it("hides on desktop and inside the installed app", () => {
    expect(shouldShowInstall({ platform: "other", standalone: false, dismissedAt: 0, now })).toBe(false);
    expect(shouldShowInstall({ platform: "android", standalone: true, dismissedAt: 0, now })).toBe(false);
  });

  it("stays hidden for a week after Skip", () => {
    const skipped = (ago) => shouldShowInstall({ platform: "ios", standalone: false, dismissedAt: now - ago, now });
    expect(skipped(60 * 1000)).toBe(false);
    expect(skipped(SNOOZE_MS - 1)).toBe(false);
    expect(skipped(SNOOZE_MS)).toBe(true);
  });
});
