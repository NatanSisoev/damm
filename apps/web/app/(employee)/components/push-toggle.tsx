"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { employeeDict } from "@/lib/i18n/employee";
import { deletePushSubscriptionAction, savePushSubscriptionAction } from "../../settings/actions";

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "working" | "error";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(current: ArrayBuffer | null, base64url: string): boolean {
  if (!current) return true; // browser does not expose it: assume it matches
  const a = new Uint8Array(current);
  const b = keyBytes(base64url);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * Opt-in for push notifications on this device. The browser asks for permission only after a tap
 * (iOS requires it, and the PWA must be on the home screen there). The subscription is stored in
 * its own table, deleted on logout and never joined to answers.
 * `compact` renders a short nudge for the home screen that hides itself once notifications are on.
 */
export function PushToggle({ vapidKey, compact = false }: { vapidKey: string; compact?: boolean }) {
  const t = useT(employeeDict);
  const [state, setState] = useState<State>("loading");
  // Compact mode (home screen after login / demo join) asks in a popup, once per browser session unless dismissed.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is client-only; reading it after mount avoids a hydration mismatch
      setDismissed(sessionStorage.getItem("push-popup-dismissed") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function later() {
    setDismissed(true);
    try {
      sessionStorage.setItem("push-popup-dismissed", "1");
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<State> => {
      if (!supported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) return "off";
        // Subscribed under another VAPID key (keys rotated or another deploy): pushes would be rejected, so resubscribe.
        if (!sameKey(sub.options.applicationServerKey, vapidKey)) {
          await sub.unsubscribe();
          if (Notification.permission !== "granted") return "off";
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) });
        }
        // Re-register on every open: the server may have lost it (fresh database, account switch) while the device kept it.
        const res = await savePushSubscriptionAction(sub.toJSON());
        return res.ok ? "on" : "off";
      } catch {
        return "off";
      }
    })().then((s) => !cancelled && setState(s));
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  async function enable() {
    setState("working");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const res = await savePushSubscriptionAction(sub.toJSON());
      setState(res.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  async function disable() {
    setState("working");
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      await sub?.unsubscribe();
      await deletePushSubscriptionAction(sub?.endpoint);
      setState("off");
    } catch {
      setState("error");
    }
  }

  if (compact && (state === "loading" || state === "on" || state === "unsupported" || state === "denied")) return null;

  if (compact) {
    if (dismissed && state !== "working") return null;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="push-popup-title" className="card w-full max-w-sm">
          <div className="card-body space-y-3">
            <h2 id="push-popup-title" className="section-title">
              {t("push_title")}
            </h2>
            <p className="text-muted">{t("push_off")}</p>
            {state === "error" && (
              <p role="alert" className="font-semibold text-warn">
                {t("push_error")}
              </p>
            )}
            <button type="button" onClick={enable} disabled={state === "working"} className="btn btn-primary h-12 w-full justify-center text-base disabled:opacity-50">
              {t("push_enable")}
            </button>
            <button type="button" onClick={later} disabled={state === "working"} className="btn h-12 w-full justify-center text-base">
              {t("campaign_later")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const body = (
    <>
      <h2 className="section-title">{t("push_title")}</h2>
      <p className="text-muted">
        {state === "on"
          ? t("push_on")
          : state === "unsupported"
            ? t("push_unsupported")
            : state === "denied"
              ? t("push_denied")
              : t("push_off")}
      </p>
      {state === "error" && (
        <p role="alert" className="font-semibold text-warn">
          {t("push_error")}
        </p>
      )}
      {(state === "off" || state === "error" || state === "working") && (
        <button type="button" onClick={enable} disabled={state === "working"} className="btn btn-primary h-12 w-full justify-center text-base disabled:opacity-50">
          {t("push_enable")}
        </button>
      )}
      {state === "on" && !compact && (
        <button type="button" onClick={disable} className="btn h-12 w-full justify-center text-base">
          {t("push_disable")}
        </button>
      )}
    </>
  );

  return (
    <section className={`card ${compact ? "mb-4" : "mt-4"}`}>
      <div className="card-body space-y-2">{body}</div>
    </section>
  );
}
