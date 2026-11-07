"use client";

import { useEffect } from "react";

// Registers the service worker (offline fallback + push stub). Failures are non-fatal.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
