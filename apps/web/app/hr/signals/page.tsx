import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getTrends, listCollectius, listDomains, listRecommendations, listTorns } from "@damm/db/hr";
import { hrAlarms, type AlarmView } from "@/lib/hr-engine";
import { Card, Empty, PageHeader } from "../ui";
import { STATUS_LABELS, signalTypeLabel } from "../signal-labels";
import { Sparkline } from "../trend";
import { recomputeAction, setAlarmStatusAction } from "../actions";
import { ALARM_NEXT } from "./transitions";
import { NON_ACTIONABLE, alarmHint, alarmPredicate, dropSize } from "./alarm-text";
import { proposeFollowUpAction } from "./actions";

const TABS = [
  { key: "obertes", label: "Obertes", statuses: ["open"] },
  { key: "revisades", label: "Revisades", statuses: ["acknowledged", "action_linked"] },
  { key: "resoltes", label: "Resoltes", statuses: ["resolved"] },
] as const;

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const SEV_LABEL: Record<string, string> = { critical: "Crític", warning: "Avís", info: "Info" };
const ALL = "Tots els col·lectius";

type Row = AlarmView & { segment: string; domain: string | null; drop: number };

export default async function AlarmsPage({ searchParams }: { searchParams: Promise<{ estat?: string }> }) {
  const { estat } = await searchParams;
  const tab = TABS.find((t) => t.key === estat) ?? TABS[0];

  const trends = getTrends();
  const domains = new Map(listDomains().map((d) => [d.id, d.nom]));
  const torns = new Map(listTorns().map((t) => [t.id, t.nom]));
  const recs = listRecommendations();

  const colNames = new Map(listCollectius().map((c) => [c.id, c.nom]));

  // Minimum group size is re-checked here even though the engine already suppresses small alarms.
  const all = hrAlarms({ role: "hr" }, { status: ["open", "acknowledged", "action_linked", "resolved"] }).filter((a) => a.n >= MIN_GROUP_SIZE);
  const counts = Object.fromEntries(TABS.map((t) => [t.key, all.filter((a) => (t.statuses as readonly string[]).includes(a.status)).length]));
  const inTab = all.filter((a) => (tab.statuses as readonly string[]).includes(a.status));

  const toRow = (a: AlarmView): Row => {
    const col = a.collectiuId ? colNames.get(a.collectiuId) ?? ALL : ALL;
    const shift = a.tornId ? torns.get(a.tornId) : null;
    return { ...a, segment: shift ? `${col} · torn ${shift}` : col, domain: a.domainId ? domains.get(a.domainId) ?? null : null, drop: dropSize(a) };
  };
  const rows = inTab.map(toRow);

  // Data quality: one note, not one card per alarm.
  const lowConf = rows.filter((r) => r.type === "low_confidence");
  const lowBySegment = new Map<string, Set<string>>();
  for (const r of lowConf) {
    const set = lowBySegment.get(r.segment) ?? new Set<string>();
    set.add(r.domain ?? "—");
    lowBySegment.set(r.segment, set);
  }

  // Actionable alarms: a weak signal that repeats a sustained decline of the same segment and domain is folded into it.
  const key = (r: Row) => `${r.collectiuId}|${r.tornId}|${r.domainId}`;
  const declines = new Set(rows.filter((r) => r.type === "sustained_decline").map(key));
  const actionable = rows.filter((r) => !NON_ACTIONABLE.has(r.type) && !(r.type === "feble" && declines.has(key(r))));
  const good = rows.filter((r) => r.type === "improvement");
  const order = (a: Row, b: Row) => (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3) || b.drop - a.drop || b.n - a.n;
  actionable.sort(order);

  const groups = new Map<string, Row[]>();
  for (const r of actionable) groups.set(r.segment, [...(groups.get(r.segment) ?? []), r]);
  const grouped = [...groups.entries()].sort((a, b) => order(a[1][0], b[1][0]));

  const sparkFor = (r: Row): number[] | null => {
    const scope = trends.series.find((s) => s.scope === (r.collectiuId ? colNames.get(r.collectiuId) : "Tots"));
    const row = scope?.rows.find((x) => x.domini === r.domain);
    const vals = row?.cells.map((c) => c.mitjana) ?? [];
    return vals.filter((v) => v !== null).length >= 2 ? (vals as number[]) : null;
  };

  const severe = actionable.filter((r) => r.severity !== "info").length;

  return (
    <>
      <PageHeader
        title="Alarmes"
        subtitle="Què ha canviat i on cal mirar. Sempre sobre grups agregats; una persona decideix què fer-ne."
        actions={
          <form action={recomputeAction}>
            <button className="btn" type="submit">Recalcula ara</button>
          </form>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="segmented" aria-label="Estat de les alarmes">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === "obertes" ? "/hr/signals" : `/hr/signals?estat=${t.key}`} aria-current={t.key === tab.key ? "true" : undefined}>
              {t.label} <span className="num ml-1.5 text-xs opacity-70">{counts[t.key]}</span>
            </Link>
          ))}
        </nav>
        <p className="text-sm">
          {actionable.length === 0 ? (
            <span className="text-subtle">Cap alarma requereix acció en aquesta vista.</span>
          ) : (
            <>
              <strong>{actionable.length} {actionable.length === 1 ? "alarma requereix" : "alarmes requereixen"} acció</strong>
              {severe > 0 && <span className="text-subtle"> · {severe} d&apos;avís o crítiques</span>}
            </>
          )}
        </p>
      </div>

      {all.length === 0 ? (
        <Empty>Cap alarma. Prem «Recalcula ara» perquè el motor torni a mirar els agregats.</Empty>
      ) : (
        <div className="space-y-6">
          {grouped.map(([segment, items]) => (
            <Card key={segment} title={segment} meta={<span className="num">{items.length} {items.length === 1 ? "alarma" : "alarmes"}</span>}>
              <ul className="divide-y divide-line">
                {items.map((r) => (
                  <AlarmItem key={r.id} r={r} spark={sparkFor(r)} rec={recs.find((x) => x.senyalId === r.id && x.estat === "aprovada")} />
                ))}
              </ul>
            </Card>
          ))}

          {good.length > 0 && (
            <Card title="Bones notícies" meta={<span className="num">{good.length}</span>}>
              <ul className="divide-y divide-line">
                {good.map((r) => (
                  <li key={r.id} className="py-2 text-[13px]">
                    <strong>{r.segment}{r.domain ? ` · ${r.domain}` : ""}</strong>: {alarmPredicate(r)}
                    <span className="num ml-2 text-xs text-subtle">{r.periode} · n={r.n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {lowBySegment.size > 0 && (
            <details className="card">
              <summary className="card-header cursor-pointer select-none">
                <span className="section-title">Qualitat de les dades</span>
                <span className="text-xs text-subtle">{lowConf.length} {lowConf.length === 1 ? "domini" : "dominis"} amb poca confiança</span>
              </summary>
              <div className="card-body space-y-2 text-[13px]">
                <p className="text-muted">
                  Encara no hi ha prou respostes per fiar-se&apos;n; no cal actuar, cal que el grup segueixi responent. Resultats amb n ≥ {MIN_GROUP_SIZE}.
                </p>
                <ul className="space-y-1">
                  {[...lowBySegment.entries()].map(([seg, doms]) => (
                    <li key={seg}><strong>{seg}</strong>: {[...doms].join(", ")}</li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          <p className="text-xs text-subtle">
            «Visible al responsable»: l&apos;alarma també arriba al responsable del col·lectiu. Les altres només les veu l&apos;equip de persones.
          </p>
        </div>
      )}
    </>
  );
}

function AlarmItem({ r, spark, rec }: { r: Row; spark: number[] | null; rec?: { id: number; seguimentNecessitatId: number | null } }) {
  const next = ALARM_NEXT[r.status];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className={`badge ${r.severity === "info" ? "" : "badge-warn"}`}>{SEV_LABEL[r.severity]}</span>
            <span className="badge">{signalTypeLabel(r.type)}</span>
            {r.status !== "open" && <span className="badge">{STATUS_LABELS[r.status]}</span>}
            {r.audience === "hr_manager" && <span className="badge" title="L'alarma també arriba al responsable del col·lectiu">Visible al responsable</span>}
          </div>
          <p className="text-[14px]">
            <strong>{r.domain ?? "General"}</strong> {alarmPredicate(r)}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            <span className="num">{r.periode} · n={r.n}</span>
            {alarmHint(r.type) && <> · {alarmHint(r.type)}</>}
          </p>
        </div>
        {spark && (
          <div className="shrink-0 text-right" title="Mitjana del domini per període (escala 1–5)">
            <Sparkline values={spark} />
            <div className="text-[11px] text-subtle">1–5</div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rec && !rec.seguimentNecessitatId ? (
          <form action={proposeFollowUpAction}>
            <input type="hidden" name="rec" value={rec.id} />
            <button className="btn btn-primary" type="submit">Proposa una enquesta de seguiment</button>
          </form>
        ) : rec ? (
          <Link href={`/hr/signals/${r.id}`} className="btn">Seguiment creat →</Link>
        ) : (
          <Link href={`/hr/signals/${r.id}`} className="btn btn-primary">Veure temes i decidir l&apos;acció →</Link>
        )}
        {next.length > 0 && (
          <details className="alarm-status">
            <summary className="btn">Marca com a… ▾</summary>
            <div className="alarm-status-menu">
              {next.map((s) => (
                <form key={s} action={setAlarmStatusAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value={s} />
                  <button type="submit">{STATUS_LABELS[s]}</button>
                </form>
              ))}
            </div>
          </details>
        )}
      </div>
    </li>
  );
}
