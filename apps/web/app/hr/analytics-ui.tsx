// Insights-first blocks shared by the HR overview and results pages. Server components; all forms post to HR-only server actions.
import Link from "next/link";
import { People } from "./glyphs";
import { MIN_GROUP_SIZE, type Lang } from "@damm/shared";

import { ChangeBadge, Sparkline } from "./trend";
import { Card, Empty, FoldList } from "./ui";
import { RecommendationBody } from "./recommendation-card";
import { approveRecommendationAction, discardRecommendationAction, followUpAction, setAlarmStatusAction } from "./actions";
import type { Headline, HeadlineWhere, Heatmap, HeatCell, NarrativeView, ReachGap, SegmentTrend, ThemesByDomain } from "./analytics";
import { segHref } from "./analytics";
import { getTL } from "@/lib/i18n/server";
import { hrResultsDict, type HrResultsKey, type HrResultsT } from "@/lib/i18n/hr-results";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { rich } from "@/lib/i18n/rich";

const signed = (v: number, lang: Lang) => `${v >= 0 ? "+" : "−"}${numD(Math.abs(v), lang, 1)}`;
const precKey = (p: string) => `prec_${p === "sòlida" ? "solida" : p}` as HrResultsKey;

/** "Benestar a Fàbriques (nit)" / "El clima a tota l'empresa". */
function whereText(t: HrResultsT, lang: Lang, w: HeadlineWhere): string {
  const domain = w.domain ? domainLabel(w.domain, lang) : t("an_hl_climate");
  const base = w.collective === "All" ? t("an_where_all", { domain }) : t("an_where_col", { domain, col: collectiveLabel(w.collective, lang) });
  return w.shift ? t("an_where_shift", { where: base, shift: shiftLabel(w.shift, lang) }) : base;
}

function headlineText(t: HrResultsT, lang: Lang, m: Headline["msg"]): string {
  const where = whereText(t, lang, m.where);
  const f1 = (v: number) => numD(v, lang, 1);
  switch (m.k) {
    case "mover":
      return t(m.up ? "an_hl_up" : "an_hl_down", { where, d: f1(m.delta), a: f1(m.prev), b: f1(m.cur) });
    case "polar":
      return t("an_hl_polar", { where, drop: Math.round(m.drop), now: Math.round(m.consensus) });
    case "importance":
      return t("an_hl_importance", { where, imp: Math.round(m.importance), score: f1(m.score) });
    case "shiftgap":
      return t("an_hl_shiftgap", {
        where,
        low: m.low ? shiftLabel(m.low, lang) : t("an_a_shift"),
        high: m.high ? shiftLabel(m.high, lang) : t("an_other_shift"),
        gap: f1(m.gap),
        ls: f1(m.lowScore),
        hs: f1(m.highScore),
      });
    case "manager":
      return t(m.gap >= 0 ? "an_hl_mgr_above" : "an_hl_mgr_below", { where, gap: f1(Math.abs(m.gap)) });
  }
}

function reachText(t: HrResultsT, lang: Lang, g: ReachGap): string {
  const label = g.kind === "torn" ? shiftLabel(g.label, lang) : collectiveLabel(g.label, lang);
  return t(g.kind === "torn" ? "an_reach_text_shift" : "an_reach_text_col", { label, r: g.resp, p: g.pop, pp: g.pp });
}

// ---------- narrative ----------

export async function NarrativeCard({ narrative, title }: { narrative: NarrativeView | null; title?: string }) {
  const { t } = await getTL(hrResultsDict);
  const d = narrative?.detail;
  return (
    <Card title={title ?? t("an_summary")} meta={narrative ? <span className="num">{narrative.periode}</span> : undefined}>
      {!d ? (
        <Empty>{t("an_nosummary", { min: MIN_GROUP_SIZE })} <Link href="/hr/methodology" className="text-accent-ink hover:underline">{t("an_how")}</Link></Empty>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] leading-relaxed">{d.summary}</p>
          {d.highlights.length > 0 && (
            <ul className="space-y-1.5 text-[13px] text-muted">
              {d.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-subtle">•</span>
                  <span>
                    {h.text} {h.domain && <span className="badge">{h.domain}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.suggestedActions.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{t("an_actions")}</div>
              <ul className="space-y-3">
                {d.suggestedActions.map((a, i) => (
                  <li key={i} className="rounded-lg border border-line p-3">
                    <div className="font-medium">{a.title}</div>
                    <p className="mt-0.5 text-[13px] text-muted">{a.why}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {a.recommendationId !== null ? (
                        <form action={followUpAction}>
                          <input type="hidden" name="id" value={a.recommendationId} />
                          <button className="btn btn-primary" type="submit">{t("an_follow")}</button>
                        </form>
                      ) : (
                        <Link href="/hr/needs" className="btn">{t("an_follow")}</Link>
                      )}
                      {a.alarmId !== null && <ReviewedButton alarmId={a.alarmId} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-subtle">{t("an_ai")}</p>
        </div>
      )}
    </Card>
  );
}

export async function ReviewedButton({ alarmId }: { alarmId: number }) {
  const { t } = await getTL(hrResultsDict);
  return (
    <form action={setAlarmStatusAction}>
      <input type="hidden" name="id" value={alarmId} />
      <input type="hidden" name="status" value="acknowledged" />
      <button className="btn" type="submit">{t("an_reviewed")}</button>
    </form>
  );
}

// ---------- proposals ----------

export async function ProposalsCard({ proposals }: { proposals: (Parameters<typeof RecommendationBody>[0]["r"] & { id: number })[] }) {
  const { t } = await getTL(hrResultsDict);
  return (
    <Card title={t("an_props")} meta={<span className="num">{proposals.length}</span>}>
      {proposals.length === 0 ? (
        <Empty>{t("an_props_empty")}</Empty>
      ) : (
        <FoldList visible={3} className="-my-1 divide-y divide-line" items={proposals.map((r) => (
            <li key={r.id} className="py-3">
              <div className="mb-1 text-xs font-medium text-subtle">{t("an_ai_short")}</div>
              <RecommendationBody r={r} />
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={discardRecommendationAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn" type="submit">{t("sd_discard")}</button>
                </form>
                <form action={approveRecommendationAction} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="approver" maxLength={60} autoComplete="off" aria-label={t("approver_label")} placeholder={t("approver_label")} className="input w-40 text-[13px]" />
                  <button className="btn btn-primary" type="submit">{t("sd_approve")}</button>
                </form>
              </div>
            </li>
          ))} />
      )}
    </Card>
  );
}

// ---------- headlines ----------

const TONE_ICON: Record<Headline["tone"], string> = { up: "↑", down: "↓", warn: "!", neutral: "•" };
const TONE_CLS: Record<Headline["tone"], string> = { up: "text-good", down: "text-warn", warn: "text-warn", neutral: "text-subtle" };

export async function HeadlineStrip({ headlines }: { headlines: Headline[] }) {
  const { t, lang } = await getTL(hrResultsDict);
  return (
    <Card title={t("an_know")} meta={t("an_know_meta")}>
      {headlines.length === 0 ? (
        <Empty>{t("an_know_empty", { min: MIN_GROUP_SIZE })}</Empty>
      ) : (
        <ol className="-my-1 divide-y divide-line">
          {headlines.map((h) => (
            <li key={h.key} className="flex items-start gap-3 py-3">
              <span aria-hidden className={`mt-0.5 w-4 shrink-0 text-center font-semibold ${TONE_CLS[h.tone]}`}>{TONE_ICON[h.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug">{headlineText(t, lang, h.msg)}</p>
                <p className="num mt-0.5 text-xs text-subtle">
                  <People n={h.n} /> <span className="font-sans">{t("an_n_smaller")}</span>
                  {h.confidence !== null && <> · {t("an_conf", { v: Math.round(h.confidence) })}</>}

                  {" · "}
                  <Link href={h.href} className="text-accent-ink hover:underline">{t("an_detail")}</Link>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------- heatmap ----------

function cellStyle(c: HeatCell, maxAbs: number): React.CSSProperties {
  if (c.suppressed || c.mean === null || c.delta === null) return {};
  const strength = Math.min(1, Math.abs(c.delta) / maxAbs);
  const pole = c.delta < 0 ? "var(--div-neg)" : "var(--div-pos)";
  // Colour = distance from the company average; opacity = how sure we are (n band).
  const opacity = c.precision === "sòlida" ? 1 : c.precision === "moderada" ? 0.8 : 0.58;
  return {
    background: `color-mix(in oklab, ${pole} ${Math.round(strength * 58)}%, var(--div-mid))`,
    opacity,
  };
}

function cellTitle(t: HrResultsT, lang: Lang, c: HeatCell): string {
  const col = collectiveLabel(c.collective, lang);
  const dom = domainLabel(c.domain, lang);
  if (c.suppressed) return t("an_cell_supp", { col, dom, min: MIN_GROUP_SIZE });
  if (c.mean === null) return t("an_cell_nodata", { col, dom });
  return t("an_cell_val", {
    col,
    dom,
    mean: numD(c.mean, lang, 1),
    delta: c.delta !== null ? t("an_delta", { d: signed(c.delta, lang) }) : "",
    n: c.n ?? "",
    prec: c.precision ? t(precKey(c.precision)) : "",
  });
}

export async function HeatmapCard({ map, selected }: { map: Heatmap; selected?: { seg?: string; dom?: string } }) {
  const { t, lang } = await getTL(hrResultsDict);
  return (
    <Card
      title={t("an_heat")}
      meta={map.periode ? rich(t("an_heat_meta", { periode: "{periode}" }), { periode: <span className="num">{map.periode}</span> }) : undefined}
    >
      {map.collectives.length === 0 ? (
        <Empty>{t("an_heat_empty")}</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="hr-heat hr-heat-grid w-full border-separate" style={{ borderSpacing: 3 }}>
              <caption className="sr-only">{t("an_heat_cap")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-24 text-left text-xs font-medium text-subtle">{t("an_th_coll")}</th>
                  {map.domains.map((d) => (
                    <th key={d} scope="col" className="px-1 text-center text-[11px] leading-tight font-medium text-subtle">{domainLabel(d, lang)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {map.collectives.map((col, ci) => (
                  <tr key={col}>
                    <th scope="row" className="pr-2 text-left text-[13px] font-medium">{collectiveLabel(col, lang)}</th>
                    {map.cells[ci].map((c) => {
                      const on = selected?.seg === c.collective && selected?.dom === c.domain;
                      return (
                        <td key={c.domain} className="p-0">
                          <Link
                            href={segHref(c.collective, c.domain)}
                            scroll={false}
                            title={cellTitle(t, lang, c)}
                            aria-label={cellTitle(t, lang, c)}
                            aria-current={on ? "true" : undefined}
                            className={`hr-heat-cell ${c.suppressed ? "hr-heat-hatch" : ""} ${on ? "hr-heat-on" : ""}`}
                            style={cellStyle(c, map.maxAbs)}
                          >
                            {c.suppressed ? <span className="sr-only">{t("an_supp")}</span> : c.mean === null ? "—" : <span className="num">{numD(c.mean, lang, 1)}</span>}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="pr-2 pt-1 text-left text-xs font-medium text-subtle">{t("an_company")}</th>
                  {map.company.map((v, i) => (
                    <td key={i} className="num pt-1 text-center text-xs text-subtle">{v === null ? "—" : numD(v, lang, 1)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-subtle">
            <span className="flex items-center gap-2">
              {t("an_below")}
              <span aria-hidden className="hr-heat-scale" />
              {t("an_above")}
            </span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="hr-heat-key hr-heat-hatch" /> {t("an_supp_key", { min: MIN_GROUP_SIZE })}</span>
            <span>{t("an_paler")}</span>
          </div>
        </>
      )}
    </Card>
  );
}

export async function SegmentTrendCard({ trend }: { trend: SegmentTrend }) {
  if (!trend) return null;
  const { t, lang } = await getTL(hrResultsDict);
  const means = trend.cells.map((c) => c.mitjana);
  return (
    <section id="tendencia" className="card scroll-mt-20">
      <div className="card-header">
        <h2 className="section-title">
          {domainLabel(trend.domain, lang)} · {trend.scope === "Tots" ? t("an_all_company") : collectiveLabel(trend.scope, lang)}
        </h2>
        <Link href="/hr/results" scroll={false} className="text-xs text-accent-ink hover:underline">{t("an_close")}</Link>
      </div>
      <div className="card-body flex flex-wrap items-center gap-x-8 gap-y-3">
        <Sparkline values={means} />
        <ol className="flex flex-wrap gap-x-6 gap-y-2">
          {trend.periodes.map((p, i) => {
            const c = trend.cells[i];
            return (
              <li key={p}>
                <div className="num text-xs text-subtle">{p}</div>
                <div className="num font-semibold">
                  {c?.suprimit ? t("an_supp") : c?.mitjana == null ? "—" : numD(c.mitjana, lang, 1)}
                  {c && !c.suprimit && c.n !== null && <span className="ml-1 text-xs font-normal text-subtle"><People n={c.n} /></span>}

                </div>
              </li>
            );
          })}
        </ol>
        <ChangeBadge canvi={trend.canvi} />
      </div>
    </section>
  );
}

// ---------- themes ----------

function ShareSpark({ shares, label }: { shares: (number | null)[]; label: string }) {
  const max = Math.max(0.05, ...shares.map((s) => s ?? 0));
  const w = 56, h = 20;
  const pts = shares.map((s, i) => (s === null ? null : { x: (i / Math.max(1, shares.length - 1)) * (w - 6) + 3, y: h - 3 - (s / max) * (h - 6) })).filter((p): p is { x: number; y: number } => p !== null);
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="inline-block">
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-chart-1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-chart-1" />)}
    </svg>
  );
}

export async function ThemesCard({ groups }: { groups: ThemesByDomain }) {
  const { t, lang } = await getTL(hrResultsDict);
  return (
    <Card title={t("an_themes")} meta={t("an_themes_meta")}>
      {groups.length === 0 ? (
        <Empty>{t("an_themes_empty", { min: MIN_GROUP_SIZE })} <Link href="/hr/methodology" className="text-accent-ink hover:underline">{t("an_how")}</Link></Empty>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.domain ?? "altres"}>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">{g.domain ? domainLabel(g.domain, lang) : t("an_nodomain")}</h3>
              <ul className="divide-y divide-line">
                {g.themes.map((th) => (
                  <li key={th.label} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{th.label}</span>
                        {th.isNew && <span className="badge badge-accent">{t("an_new")}</span>}
                        {th.weak && <span className="badge badge-warn">{t("an_weak")}</span>}
                      </div>
                      {th.summary && <p className="mt-1 text-[13px] text-muted">«{th.summary}»</p>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-subtle">
                      <ShareSpark shares={th.shares} label={t("an_share_aria")} />
                      <span className="num">{t("an_comments", { n: th.latestN })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- who to reach ----------

export async function ReachCard({ gaps }: { gaps: ReachGap[] }) {
  const { t, lang } = await getTL(hrResultsDict);
  return (
    <Card title={t("an_reach")} meta={<Link href="/hr/methodology" className="underline">{t("an_how")}</Link>}>
      {gaps.length === 0 ? (
        <Empty>{t("an_reach_empty")}</Empty>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {gaps.map((g) => {
            const text = reachText(t, lang, g);
            const label = g.kind === "torn" ? shiftLabel(g.label, lang) : collectiveLabel(g.label, lang);
            return (
            <li key={g.key} className="py-3">
              <p className="text-[14px]">{text}</p>
              <p className="mt-1 text-[13px] text-muted">{t(g.kind === "torn" ? "an_reach_act_shift" : "an_reach_act_col", { label })}</p>
              <Link href="/hr/needs?nova=1#nova" className="btn mt-2 inline-flex" aria-label={t("an_reach_aria", { text })}>{t("an_follow")}</Link>
            </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
