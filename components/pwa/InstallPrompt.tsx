"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/marketing/Logo";

// Chrome/Edge/Android fire this before offering to install; it isn't in
// TypeScript's DOM types yet.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "doughtally-install-dismissed";
const DISMISS_DAYS = 30;

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function isInstalled() {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iPhone/iPad Safari, not yet installed: the only case that gets the manual
// steps. Only Safari itself can add to the home screen on older iOS versions.
function needsIosSteps() {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return isIos && !/CriOS|FxiOS|EdgiOS/.test(ua) && !isInstalled() && !recentlyDismissed();
}
const noSubscription = () => () => {};

// "Install DoughTally" card inside the app. Android/desktop Chrome and Edge get
// a real Install button; iPhone/iPad Safari can't be prompted from a page, so
// they get the Share → Add to Home Screen steps instead. Hidden once
// installed, when opened from the home screen, or for 30 days after Not now.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const ios = useSyncExternalStore(noSubscription, needsIosSteps, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (!isInstalled() && !recentlyDismissed()) setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!deferred && !ios)) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode: it'll just ask again next visit
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  }

  return (
    <aside
      aria-label="Install DoughTally"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl bg-stone-900 p-4 text-white shadow-[0_20px_50px_-12px_rgba(28,25,23,0.6)] sm:right-5 sm:bottom-5 sm:left-auto sm:mx-0 sm:w-96"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex gap-3">
        <LogoMark className="h-11 w-11 shrink-0 rounded-xl ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Install DoughTally</p>
          {ios ? (
            <p className="mt-1 text-sm text-stone-300">
              Tap{" "}
              <svg viewBox="0 0 16 16" className="inline h-4 w-4 -translate-y-px text-amber-400" aria-label="the Share button" role="img">
                <path d="M8 1.5v8.5M5 4.5l3-3 3 3M4 7H3v7.5h10V7h-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>{" "}
              in Safari, then <span className="font-medium text-white">Add to Home Screen</span>. It opens full screen, ready to snap invoices.
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-300">Add it to your home screen: it opens full screen, one tap from snapping an invoice.</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="rounded-full px-4 py-2 text-sm text-stone-300 hover:text-white">
          {ios ? "Got it" : "Not now"}
        </button>
        {!ios && (
          <button type="button" onClick={install} className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-300">
            Install
          </button>
        )}
      </div>
    </aside>
  );
}
