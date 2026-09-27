"use client";

import { useEffect } from "react";

// Registers public/sw.js. Production builds only: in `next dev` a service
// worker holding on to old static files gets in the way of hot reload.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Not fatal: the app works the same without it, just no offline page.
    });
  }, []);
  return null;
}
