import "./alarms.css";
import { People } from "../glyphs";
import { GenerateButton } from "./generate-button";
import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getTrends, listCollectius, listDomains, listRecommendations, listTorns } from "@damm/db/hr";
import { hrAlarms, type AlarmView } from "@/lib/hr-engine";
import { Card, Empty, PageHeader } from "../ui";
import { FoldList } from "../ui-server";
import { countPendingRecommendations } from "@damm/db/hr";
import { statusLabel, signalTypeLabel } from "../signal-labels";
import { getT, getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsT } from "@/lib/i18n/hr-results";
import { hrLookup } from "@/lib/i18n/hr";
import { signalsDict } from "@/lib/i18n/hr-signals";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import type { Lang } from "@damm/shared";

import { Sparkline } from "../trend";
import { recomputeAction, setAlarmStatusAction } from "../actions";
import { ALARM_NEXT } from "./transitions";
import { NON_ACTIONABLE, alarmHint } from "./alarm-text";
import { signalDetail, signalDrop, signalSegment } from "@/lib/signal-text";
import { generateRecommendationsAction, proposeFollowUpAction } from "./actions";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_alarms");

const TABS = [
  { key: "obertes", label: "sg_tab_open", statuses: ["open"] },
  { key: "revisades", label: "sg_tab_reviewed", statuses: ["acknowledged", "action_linked"] },
  { key: "resoltes", label: "sg_tab_resolved", statuses: ["resolved"] },
] as const;

const SEV_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

type Row = AlarmView & { segment: string; domain: string | null; drop: number; detail: string };

type Params = { estat?: string; tipus?: string; gravetat?: string; collectiu?: string; domini?: string; torn?: string; periode?: string; audiencia?: string; ordre?: string; q?: string };

const SORTS = [
  { key: "gravetat", label: "sort_severity" },
  { key: "caiguda", label: "sort_drop" },
  { key: "mostra", label: "sort_n" },
  { key: "recent", label: "sort_recent" },
  { key: "grup", label: "sort_group" },
] as const;

export default async function AlarmsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const pendingRecs = countPendingRecommendations();
  const sp = await searchParams;
  const { estat } = sp;
  const { t, lang } = await getTL(hrResultsDict);
  const ts = await getT(signalsDict);
  const tab = TABS.find((x) => x.key === estat) ?? TABS[0];


  const trends = getTrends();
  const domains = new Map(listDomains().map((d) => [d.id, d.nom]));
  const torns = new Map(listTorns().map((x) => [x.id, x.nom]));
  const recs = listRecommendations();

  const colNames = new Map(listCollectius().map((c) => [c.id, c.nom]));

  // Minimum group size is re-checked here even though the engine already suppresses small alarms.
  const all = hrAlarms({ role: "hr" }, { status: ["open", "acknowledged", "action_linked", "resolved"] }).filter((a) => a.n >= MIN_GROUP_SIZE);
  const counts = Object.fromEntries(TABS.map((x) => [x.key, all.filter((a) => (x.statuses as readonly string[]).includes(a.status)).length]));
  const inTab = all.filter((a) => (tab.statuses as readonly string[]).includes(a.status));

  const toRow = (a: AlarmView): Row => {
    const col = a.collectiuId ? colNames.get(a.collectiuId) ?? null : null;
    const shift = a.tornId ? torns.get(a.tornId) ?? null : null;
    const like = { tipus: a.type, descripcio: a.description };
    return { ...a, segment: signalSegment({ collectiu: col, torn: shift }, lang), domain: a.domainId ? domains.get(a.domainId) ?? null : null, drop: signalDrop(like), detail: signalDetail(like, lang) };
  };
  const tabRows = inTab.map(toRow);

  // Filters (GET form, so the URL is shareable). Options come from what exists in this tab.
  const f = {
    tipus: sp.tipus ?? "", gravetat: sp.gravetat ?? "", collectiu: sp.collectiu ?? "", domini: sp.domini ?? "",
    torn: sp.torn ?? "", periode: sp.periode ?? "", audiencia: sp.audiencia ?? "", q: (sp.q ?? "").trim().toLowerCase(),
  };
  const sort = SORTS.find((x) => x.key === sp.ordre)?.key ?? "gravetat";
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const opts = {
    tipus: uniq(tabRows.map((r) => r.type)),
    periode: uniq(tabRows.map((r) => r.periode)).sort().reverse(),
    collectiu: uniq(tabRows.map((r) => r.collectiuId).filter((x): x is number => x != null)),
    domini: uniq(tabRows.map((r) => r.domainId).filter((x): x is number => x != null)),
    torn: uniq(tabRows.map((r) => r.tornId).filter((x): x is number => x != null)),
  };
  const rows = tabRows.filter((r) =>
    (!f.tipus || r.type === f.tipus) &&
    (!f.gravetat || r.severity === f.gravetat) &&
    (!f.collectiu || (f.collectiu === "tots" ? r.collectiuId == null : String(r.collectiuId) === f.collectiu)) &&
    (!f.domini || String(r.domainId) === f.domini) &&
    (!f.torn || String(r.tornId) === f.torn) &&
    (!f.periode || r.periode === f.periode) &&
    (!f.audiencia || r.audience === f.audiencia) &&
    (!f.q || `${r.segment} ${r.domain ?? ""} ${r.detail} ${signalTypeLabel(r.type, lang)}`.toLowerCase().includes(f.q)),
  );
  const activeFilters = Object.values(f).filter(Boolean).length;
  const tabHref = (key: string) => {
    const qs = new URLSearchParams();
    if (key !== "obertes") qs.set("estat", key);
    for (const [k, v] of Object.entries(sp)) if (k !== "estat" && v) qs.set(k, v);
    const str = qs.toString();
    return str ? `/hr/signals?${str}` : "/hr/signals";
  };

  // Data quality: one note, not one card per alarm.
  const lowConf = rows.filter((r) => r.type === "low_confidence");
  const lowBySegment = new Map<string, Set<string>>();
  for (const r of lowConf) {
    const set = lowBySegment.get(r.segment) ?? new Set<string>();
    set.add(r.domain ? domainLabel(r.domain, lang) : "—");
    lowBySegment.set(r.segment, set);
  }

  // Actionable alarms: a weak signal that repeats a sustained decline of the same segment and domain is folded into it.
  const key = (r: Row) => `${r.collectiuId}|${r.tornId}|${r.domainId}`;
  const declines = new Set(rows.filter((r) => r.type === "sustained_decline").map(key));
  const actionable = rows.filter((r) => !NON_ACTIONABLE.has(r.type) && !(r.type === "feble" && declines.has(key(r))));
  const good = rows.filter((r) => r.type === "improvement");
  const bySeverity = (a: Row, b: Row) => (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3) || b.drop - a.drop || b.n - a.n;
  const order =
    sort === "caiguda" ? (a: Row, b: Row) => b.drop - a.drop || bySeverity(a, b)
    : sort === "mostra" ? (a: Row, b: Row) => b.n - a.n || bySeverity(a, b)
    : sort === "recent" ? (a: Row, b: Row) => b.createdAt.localeCompare(a.createdAt) || bySeverity(a, b)
    : sort === "grup" ? (a: Row, b: Row) => a.segment.localeCompare(b.segment, lang) || bySeverity(a, b)
    : bySeverity;
  actionable.sort(order);

  const groups = new Map<string, Row[]>();
  for (const r of actionable) groups.set(r.segment, [...(groups.get(r.segment) ?? []), r]);
  const grouped = [...groups.entries()].sort((a, b) => order(a[1][0], b[1][0]));
  good.sort(order);

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
        title={t("sg_title")}
        subtitle={t("sg_sub")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/hr/recommendations" className="btn">
              {ts("suggestions")}{pendingRecs > 0 && <span className="badge num">{pendingRecs}</span>}
            </Link>
            <form action={recomputeAction}>
              <button className="btn" type="submit">{t("sg_recalc")}</button>
            </form>
          </div>

        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="segmented" aria-label={t("sg_nav_aria")}>
          {TABS.map((x) => (
            <Link key={x.key} href={tabHref(x.key)} aria-current={x.key === tab.key ? "true" : undefined}>
              {t(x.label)} <span className="num ml-1.5 text-xs opacity-70">{counts[x.key]}</span>

            </Link>
          ))}
        </nav>
        <p className="text-sm">
          {actionable.length === 0 ? (
            <span className="text-subtle">{t("sg_none_view")}</span>
          ) : (
            <>
              <strong>{t(actionable.length === 1 ? "sg_need_one" : "sg_need_many", { n: actionable.length })}</strong>
              {severe > 0 && severe < actionable.length && <span className="text-subtle"> · {t(severe === 1 ? "sg_sev_one" : "sg_sev_many", { n: severe })}</span>}
            </>
          )}
        </p>
      </div>

      {all.length > 0 && (
        <form method="get" action="/hr/signals" className="alarm-filters mb-5" aria-label={ts("filters_aria")}>
          {tab.key !== "obertes" && <input type="hidden" name="estat" value={tab.key} />}
          <Select all={ts("f_all")} name="tipus" label={ts("f_type")} value={f.tipus} options={opts.tipus.map((v) => [v, signalTypeLabel(v, lang)])} />
          <Select all={ts("f_all")} name="gravetat" label={ts("f_severity")} value={f.gravetat} options={[["critical", ts("sev_critical")], ["warning", ts("sev_warning")], ["info", ts("sev_info")]]} />
          <Select all={ts("f_all")} name="collectiu" label={ts("f_collective")} value={f.collectiu} options={[...opts.collectiu.map((v) => [String(v), colNames.has(v) ? collectiveLabel(colNames.get(v)!, lang) : `#${v}`] as [string, string]), ["tots", ts("f_whole_company")]]} />
          <Select all={ts("f_all")} name="domini" label={ts("f_domain")} value={f.domini} options={opts.domini.map((v) => [String(v), domains.has(v) ? domainLabel(domains.get(v)!, lang) : `#${v}`])} />
          <Select all={ts("f_all")} name="torn" label={ts("f_shift")} value={f.torn} options={opts.torn.map((v) => [String(v), torns.has(v) ? shiftLabel(torns.get(v)!, lang) : `#${v}`])} />
          <Select all={ts("f_all")} name="periode" label={ts("f_period")} value={f.periode} options={opts.periode.map((v) => [v, v])} />
          <Select all={ts("f_all")} name="audiencia" label={ts("f_visibility")} value={f.audiencia} options={[["hr_manager", ts("vis_manager")], ["hr", ts("vis_hr")]]} />
          <label className="alarm-filter">
            <span>{ts("f_search")}</span>
            <input className="input" type="search" name="q" defaultValue={sp.q ?? ""} placeholder={ts("f_search_ph")} />
          </label>
          <label className="alarm-filter">
            <span>{ts("f_sort")}</span>
            <select className="input" name="ordre" defaultValue={sort}>
              {SORTS.map((o) => <option key={o.key} value={o.key}>{ts(o.label)}</option>)}
            </select>
          </label>
          <div className="alarm-filter-actions">
            <button className="btn btn-primary" type="submit">{ts("f_apply")}</button>
            {(activeFilters > 0 || sort !== "gravetat") && <Link className="btn" href={tab.key === "obertes" ? "/hr/signals" : `/hr/signals?estat=${tab.key}`}>{ts("f_clear")}</Link>}
          </div>
        </form>
      )}

      {all.length === 0 ? (
        <Empty>{t("sg_empty")}</Empty>
      ) : rows.length === 0 ? (
        <Empty>{ts("empty_filtered")}</Empty>
      ) : (
        <div className="space-y-6">
          <FoldList as="div" visible={4} className="space-y-6" items={grouped.map(([segment, items]) => (
            <details key={segment} className="card alarm-group" open>
              <summary className="card-header cursor-pointer select-none">
                <span className="flex items-center gap-2">
                  <svg className="alarm-group-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  <h2 className="section-title">{segment}</h2>
                </span>
                <span className="num text-xs text-subtle">{t(items.length === 1 ? "sg_count_one" : "sg_count_many", { n: items.length })}</span>
              </summary>
              <div className="card-body">
                <FoldList
                  className="divide-y divide-line"
                  items={items.map((r) => (
                    <AlarmItem key={r.id} t={t} lang={lang} r={r} spark={sparkFor(r)} rec={recs.find((x) => x.senyalId === r.id && x.estat === "aprovada")} drafted={recs.some((x) => x.senyalId === r.id)} />
                  ))}
                />
              </div>
            </details>
          ))} />

          {good.length > 0 && (
            <Card title={t("sg_good")} meta={<span className="num">{good.length}</span>}>
              <FoldList className="divide-y divide-line" items={good.map((r) => (
                  <li key={r.id} className="py-2 text-[13px]">
                    <strong>{r.domain ? `${domainLabel(r.domain, lang)} · ` : ""}{r.segment}</strong>: {r.detail}
                    <span className="num ml-2 text-xs text-subtle">{r.periode} · <People n={r.n} scoped={r.collectiuId !== null || r.tornId !== null} /></span>

                  </li>
                ))} />
            </Card>
          )}

          {lowBySegment.size > 0 && (
            <details className="card">
              <summary className="card-header cursor-pointer select-none">
                <span className="section-title">{t("sg_dq")}</span>
                <span className="text-xs text-subtle">{t(lowConf.length === 1 ? "sg_dq_one" : "sg_dq_many", { n: lowConf.length })}</span>
              </summary>
              <div className="card-body space-y-2 text-[13px]">
                <p className="text-muted">
                  {t("sg_dq_note", { min: MIN_GROUP_SIZE })}
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
            {t("sg_foot", { label: t("sg_vis") })}
          </p>
        </div>
      )}
    </>
  );
}

function Select({ all, name, label, value, options }: { all: string; name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="alarm-filter">
      <span>{label}</span>
      <select className="input" name={name} defaultValue={value}>
        <option value="">{all}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function AlarmItem({ t, lang, r, spark, rec, drafted }: { t: HrResultsT; lang: Lang; r: Row; spark: number[] | null; rec?: { id: number; seguimentNecessitatId: number | null }; drafted: boolean }) {

  const next = ALARM_NEXT[r.status];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className={`badge ${r.severity === "critical" ? "badge-crit" : r.severity === "info" ? "" : "badge-warn"}`}>{hrLookup("sev_", r.severity, lang)}</span>
            <span className="badge">{signalTypeLabel(r.type, lang)}</span>
            {r.status !== "open" && <span className="badge">{statusLabel(r.status, lang)}</span>}
            {r.audience === "hr_manager" && <span className="badge" title={t("sg_vis_title")}>{t("sg_vis")}</span>}
          </div>
          <p className="text-[14px] font-semibold">{r.domain ? domainLabel(r.domain, lang) : t("sg_general")}</p>
          <p className="text-[13px] text-muted">{r.detail}</p>
          <p className="mt-0.5 text-xs text-subtle">
            <span className="num">{r.periode} · <People n={r.n} scoped={r.collectiuId !== null || r.tornId !== null} /></span>
            {alarmHint(r.type, lang) && <> · {alarmHint(r.type, lang)}</>}

          </p>
        </div>
        {spark && (
          <div className="shrink-0 text-right" title={t("sg_spark_title")}>
            <Sparkline values={spark} />
            <div className="text-[11px] text-subtle">{t("sg_spark_cap")}</div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rec && !rec.seguimentNecessitatId ? (
          <form action={proposeFollowUpAction}>
            <input type="hidden" name="rec" value={rec.id} />
            <button className="btn btn-primary" type="submit">{t("sg_propose")}</button>
          </form>
        ) : rec ? (
          <Link href={`/hr/signals/${r.id}`} className="btn">{t("sg_created")}</Link>
        ) : (
          <Link href={`/hr/signals/${r.id}`} className="btn btn-primary">{t("sg_review")}</Link>
        )}
        {!drafted && r.domainId != null && !NON_ACTIONABLE.has(r.type) && (
          <form action={generateRecommendationsAction}>
            <input type="hidden" name="signal" value={r.id} />
            <GenerateButton />
          </form>
        )}
        {r.status === "open" && (
          <form action={setAlarmStatusAction}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value="acknowledged" />
            <button type="submit" className="alarm-icon-btn" aria-label={t("sg_dismiss")} title={t("sg_dismiss")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </form>
        )}
        {next.includes("resolved") && (
          <form action={setAlarmStatusAction}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="status" value="resolved" />
            <button type="submit" className="alarm-icon-btn" aria-label={t("sg_resolve")} title={t("sg_resolve")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
