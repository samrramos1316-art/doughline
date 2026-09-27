"use client";

import { useEffect } from "react";

// Reloads the page the visitor was trying to open as soon as the connection
// returns (the URL is still theirs; the service worker only swapped the page).
export function RetryWhenOnline() {
  useEffect(() => {
    const reload = () => location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="mt-8 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
    >
      Try again
    </button>
  );
}
