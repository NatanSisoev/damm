import Link from "next/link";
import { hrAlarms } from "@/lib/hr-engine";
import { Card, Empty, PageHeader } from "../ui";
import { SignalBadges, STATUS_LABELS } from "../signal-labels";
import { recomputeAction, setAlarmStatusAction } from "../actions";
import { ALARM_NEXT } from "./transitions";

export default async function AlarmsPage() {
  const alarms = hrAlarms({ role: "hr" }, { status: ["open", "acknowledged", "action_linked", "resolved"] });
  return (
    <>
      <PageHeader
        title="Alarmes"
        subtitle="Senyals que detecta el motor a partir dels agregats. Cap és individual; cada una és revisada per una persona."
        actions={
          <form action={recomputeAction}>
            <button className="btn" type="submit">Recalcula ara</button>
          </form>
        }
      />
      <Card title="Alarmes" meta={<span className="num">{alarms.length}</span>}>
        {alarms.length === 0 ? (
          <Empty>Cap alarma activa.</Empty>
        ) : (
          <ul className="space-y-3">
            {alarms.map((a) => (
              <li key={a.id} className="rounded-lg border border-line p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <SignalBadges tipus={a.type} severity={a.severity} status={a.status} />
                  {a.audience === "hr" && <span className="badge">Només RH</span>}
                  <span className="num ml-auto text-xs text-subtle">{a.periode} · n={a.n}</span>
                </div>
                <p className="text-[13px]">{a.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {ALARM_NEXT[a.status].map((s) => (
                    <form key={s} action={setAlarmStatusAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value={s} />
                      <button className="btn" type="submit">{STATUS_LABELS[s]}</button>
                    </form>
                  ))}
                  <Link href={`/hr/signals/${a.id}`} className="ml-auto text-xs text-accent-ink hover:underline">Veure detall →</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
