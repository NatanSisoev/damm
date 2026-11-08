"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { hrDict } from "@/lib/i18n/hr";
import { deleteHrPushAction, saveHrPushAction, testHrPushAction } from "./actions";

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on" | "working" | "error";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// The HR portal does not register the service worker on its own, so do it here (same /sw.js as the employee app).
const registration = () => navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready);

/** Opt-in for alarm notifications on this HR browser: a push when the analysis job finds new alarms. */
export function AlarmPushToggle({ vapidKey }: { vapidKey: string | null }) {
  const t = useT(hrDict);
  const [state, setState] = useState<State>("loading");
  const [tested, setTested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<State> => {
      if (!vapidKey) return "unconfigured";
      if (!supported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      try {
        const sub = await (await registration()).pushManager.getSubscription();
        if (!sub) return "off";
        await saveHrPushAction(sub.toJSON()); // re-register in case the server lost it (fresh DB)
        return "on";
      } catch {
        return "off";
      }
    })().then((s) => !cancelled && setState(s));
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  async function enable() {
    if (!vapidKey) return;
    setState("working");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) }));
      const res = await saveHrPushAction(sub.toJSON());
      setState(res.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  async function disable() {
    setState("working");
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) await deleteHrPushAction(sub.endpoint);
      setState("off");
    } catch {
      setState("error");
    }
  }

  async function test() {
    setState("working");
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      const res = sub ? await testHrPushAction(sub.toJSON()) : { ok: false };
      setTested(res.ok);
      setState(res.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  const message =
    state === "on" ? t("set_push_on")
    : state === "unsupported" ? t("set_push_unsupported")
    : state === "unconfigured" ? t("set_push_unconfigured")
    : state === "denied" ? t("set_push_denied")
    : t("set_push_off");

  return (
    <div className="space-y-3">
      <p className="text-[14px] text-muted">{t("set_push_body")}</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[14px]" aria-live="polite">{state === "loading" ? "" : message}</p>
        <div className="flex gap-2">
          {state === "on" && (
            <>
              <button type="button" className="btn btn-ghost" onClick={test}>{t("set_push_test")}</button>
              <button type="button" className="btn" onClick={disable}>{t("set_push_disable")}</button>
            </>
          )}
          {(state === "off" || state === "error" || state === "working") && (
            <button type="button" className="btn btn-primary" onClick={enable} disabled={state === "working"}>{t("set_push_enable")}</button>
          )}
        </div>
      </div>
      {tested && state === "on" && <p className="text-[13px] text-subtle" role="status">{t("set_push_test_sent")}</p>}
      {state === "error" && <p role="alert" className="text-[13px] font-semibold text-warn">{t("set_push_error")}</p>}
    </div>
  );
}
