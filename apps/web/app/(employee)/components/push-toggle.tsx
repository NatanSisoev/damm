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

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<State> => {
      if (!supported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      try {
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        return sub ? "on" : "off";
      } catch {
        return "off";
      }
    })().then((s) => !cancelled && setState(s));
    return () => {
      cancelled = true;
    };
  }, []);

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
      await deletePushSubscriptionAction();
      setState("off");
    } catch {
      setState("error");
    }
  }

  if (compact && (state === "loading" || state === "on" || state === "unsupported" || state === "denied")) return null;

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
