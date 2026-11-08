import Link from "next/link";
import { QUESTION_TYPES } from "@damm/shared";
import { hrPool, type PoolQuestion } from "@/lib/hr-engine";
import { FoldAll, GroupBody } from "./group-body";
import { Empty, PageHeader, Stat } from "../ui";
import { questionTypeLabel } from "../labels";
import { REASON, STATE } from "./labels";
import { getTL } from "@/lib/i18n/server";
import { poolDict, type PoolKey } from "@/lib/i18n/hr-pool";
import { collectiveLabel, domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import type { TFn } from "@/lib/i18n/core";
import type { Lang } from "@damm/shared";
import { pageTitle } from "@/lib/i18n/titles";

export const generateMetadata = pageTitle("hr_pool");

export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "none", label: "g_none" },
  { key: "domain", label: "g_domain" },
  { key: "type", label: "g_type" },
  { key: "facet", label: "g_facet" },
  { key: "collective", label: "g_collective" },
  { key: "need", label: "g_need" },
  { key: "state", label: "g_state" },
  { key: "source", label: "g_source" },
] as const satisfies ReadonlyArray<{ key: string; label: PoolKey }>;
type GroupKey = (typeof GROUPS)[number]["key"];

const SORTS = [
  { key: "id", label: "s_id" },
  { key: "asked", label: "s_asked" },
  { key: "responses", label: "s_responses" },
  { key: "rate", label: "s_rate" },
  { key: "last", label: "s_last" },
  { key: "confidence", label: "s_confidence" },
  { key: "consensus", label: "s_consensus" },
  { key: "priority", label: "s_priority" },
  { key: "pending", label: "s_pending" },
] as const satisfies ReadonlyArray<{ key: string; label: PoolKey }>;
type SortKey = (typeof SORTS)[number]["key"];

type Params = { page?: string; per?: string; q?: string; estat?: string; tipus?: string; domini?: string; col?: string; origen?: string; group?: string; sort?: string; dir?: string };

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const day = (s: string | null) => (s ? s.slice(0, 10) : "—");

type T = TFn<PoolKey>;

function ago(t: T, today: string, d: string | null): string {
  if (!d) return t("never");
  const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (n <= 0) return t("today");
  if (n === 1) return t("yesterday");
  return t("days_ago", { n });
}

function groupOf(q: PoolQuestion, by: GroupKey, t: T, lang: Lang): string {
  const dom = domainLabel(q.domain, lang);
  switch (by) {
    case "domain": return dom;
    case "type": return questionTypeLabel(q.type, lang);
    case "facet": return q.facet ? `${dom} · ${q.facet}` : `${dom} · ${t("no_facet")}`;
    case "collective": return collectiveLabel(q.collective, lang);
    case "need": return q.needId === null ? t("continuous") : t("need_n_title", { n: q.needId, title: q.needTitle ?? "" });
    case "state": return t(STATE[q.state].key);
    case "source": return q.aiGenerated ? t("src_ai") : t("src_human");
    default: return "";
  }
}

const SORT_FN: Record<SortKey, (q: PoolQuestion) => number> = {
  id: (q) => q.id,
  asked: (q) => q.asked,
  responses: (q) => q.responses,
  rate: (q) => q.answerRate ?? -1,
  last: (q) => (q.lastAskedDay ? Date.parse(q.lastAskedDay) : -1),
  confidence: (q) => q.confidence ?? -1,
  consensus: (q) => q.consensus ?? -1,
  priority: (q) => q.priority,
  pending: (q) => q.pendingAccounts ?? -1,
};

function href(p: Params, over: Partial<Params>): string {
  const merged = { ...p, ...over };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/hr/pool?${s}` : "/hr/pool";
}

export default async function PoolPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const { t, lang } = await getTL(poolDict);
  const num = (x: number) => numD(x, lang, 0);
  const pool = hrPool();
  const { summary: s } = pool;

  // Default: questions sharing a facet (interchangeable wordings of the same item) sit together.
  const group = (GROUPS.find((g) => g.key === p.group)?.key ?? "facet") as GroupKey;
  const sort = (SORTS.find((x) => x.key === p.sort)?.key ?? "id") as SortKey;
  const dir = p.dir === "desc" || (p.dir !== "asc" && sort !== "id") ? "desc" : "asc";
  const needle = (p.q ?? "").trim().toLowerCase();

  const domains = [...new Map(pool.questions.map((q) => [q.domainId, q.domain])).entries()];
  const collectives = [...new Set(pool.questions.map((q) => q.collective))];

  let qs = pool.questions.filter((q) => {
    if (p.estat && q.state !== p.estat) return false;
    if (p.tipus && q.type !== p.tipus) return false;
    if (p.domini && String(q.domainId) !== p.domini) return false;
    if (p.col && q.collective !== p.col) return false;
    if (p.origen === "need" && q.needId === null) return false;
    if (p.origen === "monitor" && q.needId !== null) return false;
    if (p.origen === "followup" && !q.isFollowup) return false;
    if (needle && !`${q.id} ${q.text} ${q.facet ?? ""} ${q.needTitle ?? ""}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const f = SORT_FN[sort];
  qs = [...qs].sort((a, b) => (dir === "asc" ? f(a) - f(b) : f(b) - f(a)) || a.id - b.id);

  const groups = new Map<string, PoolQuestion[]>();
  for (const q of qs) {
    const k = groupOf(q, group, t, lang);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(q);
  }
  // Pagination follows the displayed order (groups first), so a group can span pages; its header totals cover the whole group.
  const PER = [25, 50, 100, 200];
  const per = PER.includes(Number(p.per)) ? Number(p.per) : 50;
  const ordered = [...groups.values()].flat();
  const pages = Math.max(1, Math.ceil(ordered.length / per));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(p.page)) || 1));
  const shown = new Set(ordered.slice((page - 1) * per, page * per).map((q) => q.id));
  const filtered = Boolean(p.q || p.estat || p.tipus || p.domini || p.col || p.origen);

  return (
    <div className="mx-auto max-w-[88rem]">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("stat_questions")} value={num(s.counts.total)} hint={t("stat_questions_hint", { live: s.counts.live, waiting: s.counts.waiting, inactive: s.counts.inactive })} />
        <Stat label={t("stat_asked")} value={num(s.asked)} hint={t("stat_last7", { n: num(s.asked7d) })} />
        <Stat label={t("stat_responses")} value={num(s.responses)} hint={t("stat_last7", { n: num(s.responses7d) })} />
        <Stat label={t("stat_rate")} value={pct(s.answerRate)} hint={t("stat_rate_hint")} />
        <Stat label={t("stat_batch")} value={t("stat_batch_value", { n: s.questionsPerDay })} hint={t("stat_batch_hint", { n: s.itemCooldownDays })} />
        <Stat label={t("stat_accounts")} value={num(s.accounts)} hint={t("stat_accounts_hint", { day: s.today, tz: s.timezone })} />
      </div>

      <form method="get" action="/hr/pool" className="card mb-4">
        {p.per && <input type="hidden" name="per" value={p.per} />}
        <div className="card-body grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="col-span-2">
            <label htmlFor="q" className="label">{t("f_search")}</label>
            <input id="q" name="q" defaultValue={p.q ?? ""} placeholder={t("f_search_ph")} className="input w-full" />
          </div>
          <Select id="estat" label={t("f_state")} allLabel={t("f_all")} value={p.estat} options={[["live", t("st_live")], ["waiting", t("st_waiting")], ["inactive", t("st_inactive")]]} />
          <Select id="tipus" label={t("f_type")} allLabel={t("f_all")} value={p.tipus} options={QUESTION_TYPES.map((qt) => [qt, questionTypeLabel(qt, lang)])} />
          <Select id="domini" label={t("f_domain")} allLabel={t("f_all")} value={p.domini} options={domains.map(([id, nom]) => [String(id), domainLabel(nom, lang)])} />
          <Select id="col" label={t("f_collective")} allLabel={t("f_all")} value={p.col} options={collectives.map((c) => [c, collectiveLabel(c, lang)])} />
          <Select id="origen" label={t("f_origin")} allLabel={t("f_all")} value={p.origen} options={[["monitor", t("continuous")], ["need", t("src_hr_need")], ["followup", t("src_followup")]]} />
          <Select id="group" label={t("f_group")} allLabel="—" value={group} options={GROUPS.map((g) => [g.key, t(g.label)])} blank={false} />
          <Select id="sort" label={t("f_sort")} allLabel="—" value={sort === "id" ? undefined : sort} options={SORTS.filter((x) => x.key !== "id").map((x) => [x.key, t(x.label)])} />
          <Select id="dir" label={t("f_dir")} allLabel="—" value={p.dir} options={[["asc", t("f_asc")], ["desc", t("f_desc")]]} />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">{t("apply")}</button>
            <Link href="/hr/pool" className="btn btn-ghost">{t("clear")}</Link>
          </div>
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-subtle" aria-live="polite">
        {filtered ? t("count_filtered", { n: qs.length, total: pool.questions.length }) : t("count_all", { n: qs.length })}
        {group !== "none" && t("count_groups", { n: groups.size, by: t(GROUPS.find((g) => g.key === group)!.label).toLowerCase() })}
      </p>
      {group !== "none" && <FoldAll />}
      </div>

      {qs.length === 0 ? (
        <Empty>{t("none_match")}</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[70rem]">
            <thead>
              <tr>
                <th>{t("th_question")}</th>
                <th>{t("th_state")}</th>
                <th>{t("th_domain_col")}</th>
                <SortTh p={p} k="asked" cur={sort} dir={dir}>{t("th_asked")}</SortTh>
                <SortTh p={p} k="responses" cur={sort} dir={dir}>{t("th_responses")}</SortTh>
                <SortTh p={p} k="rate" cur={sort} dir={dir}>{t("th_rate")}</SortTh>
                <SortTh p={p} k="confidence" cur={sort} dir={dir}>{t("th_confidence")}</SortTh>
                <SortTh p={p} k="consensus" cur={sort} dir={dir}>{t("th_consensus")}</SortTh>
                <th className="text-right">{t("th_7d")}</th>
                <SortTh p={p} k="last" cur={sort} dir={dir} left>{t("th_last")}</SortTh>
                <th>{t("th_next")}</th>
              </tr>
            </thead>
            {[...groups.entries()].filter(([, list]) => list.some((q) => shown.has(q.id))).map(([name, list]) => (
              group === "none" ? (
                <tbody key="all">
                  {list.filter((q) => shown.has(q.id)).map((q) => (
                    <QuestionRows key={q.id} q={q} today={s.today} t={t} lang={lang} num={num} />
                  ))}
                </tbody>
              ) : (
                <GroupBody
                  key={name}
                  count={list.filter((q) => shown.has(q.id)).length}
                  header={
                    <span className="pool-group-head">
                      <span className="font-semibold">{name}</span>
                      <span className="num text-subtle font-normal">
                        {t("group_summary", {
                          questions: t(list.length === 1 ? "question_one" : "question_other", { n: list.length }),
                          asked: num(list.reduce((n, q) => n + q.asked, 0)),
                          responses: num(list.reduce((n, q) => n + q.responses, 0)),
                          rate: pct(list.reduce((n, q) => n + q.asked, 0) > 0 ? list.reduce((n, q) => n + q.answeredAssigned, 0) / list.reduce((n, q) => n + q.asked, 0) : null),
                        })}
                      </span>
                    </span>
                  }
                >
                  {list.filter((q) => shown.has(q.id)).map((q) => (
                    <QuestionRows key={q.id} q={q} today={s.today} t={t} lang={lang} num={num} />
                  ))}
                </GroupBody>
              )
            ))}
          </table>
        </div>
      )}
      {qs.length > 0 && (
        <nav aria-label={t("pages_aria")} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-subtle num">
            {t("range_of", { from: (page - 1) * per + 1, to: Math.min(page * per, ordered.length), total: ordered.length })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-subtle">{t("per_page")}</span>
            {PER.map((n) => (
              <Link key={n} href={href(p, { per: n === 50 ? undefined : String(n), page: undefined })} aria-current={n === per ? "true" : undefined} className={`px-2 py-1 ${n === per ? "font-bold underline" : ""}`}>{n}</Link>
            ))}
            <span className="mx-2" />
            {page > 1 ? <Link href={href(p, { page: String(page - 1) })} rel="prev" className="btn btn-ghost border border-line-strong px-3 py-1.5">{t("prev")}</Link> : <span className="px-3 py-1.5 text-subtle">{t("prev")}</span>}
            <span className="num px-2">{t("page_of", { page, pages })}</span>
            {page < pages ? <Link href={href(p, { page: String(page + 1) })} rel="next" className="btn btn-ghost border border-line-strong px-3 py-1.5">{t("next")}</Link> : <span className="px-3 py-1.5 text-subtle">{t("next")}</span>}
          </div>
        </nav>
      )}
    </div>
  );
}

function Select({ id, label, allLabel, value, options, blank = true }: { id: string; label: string; allLabel: string; value?: string; options: ReadonlyArray<readonly [string, string]>; blank?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} name={id} defaultValue={value ?? ""} className="input w-full">
        {blank && <option value="">{allLabel}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function SortTh({ p, k, cur, dir, children, left }: { p: Params; k: SortKey; cur: SortKey; dir: string; children: React.ReactNode; left?: boolean }) {
  const active = cur === k;
  const next = active && dir === "desc" ? "asc" : "desc";
  return (
    <th className={left ? "" : "text-right"} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href(p, { sort: k, dir: next, page: undefined })}>
        {children}
        {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

function QuestionRows({ q, today, t, lang, num }: { q: PoolQuestion; today: string; t: T; lang: Lang; num: (x: number) => string }) {
  const st = STATE[q.state];
  return (
    <>
      <tr className="pool-row">
        <td className="max-w-[26rem]">
          <div className="text-[13px] leading-snug">
            <Link href={`/hr/pool/${q.id}`} className="pool-link">{q.text}</Link>
          </div>
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
            <span className="badge">{questionTypeLabel(q.type, lang)}</span>
            {q.facet && <span className="badge" title={t("badge_facet_title")}>{q.facet}</span>}
            {q.needId !== null && <span className="badge badge-accent" title={q.needTitle ?? undefined}>{t("need_n", { n: q.needId })}</span>}
            {q.isFollowup && <span className="badge">{t("badge_followup")}</span>}
            {q.polarity === -1 && <span className="badge" title={t("badge_negative_title")}>{t("badge_negative")}</span>}
            {q.aiGenerated && <span className="badge" title={t("badge_ai_title")}>{t("badge_ai")}</span>}
          </div>
        </td>
        <td>
          <span className={`badge ${st.cls}`}>{t(st.key)}</span>
          <div className="mt-1 max-w-[12rem] text-xs text-subtle">{t(REASON[q.reason])}</div>
        </td>
        <td className="text-[13px]">
          {domainLabel(q.domain, lang)}
          <div className="text-xs text-subtle">{collectiveLabel(q.collective, lang)}</div>
        </td>
        <td className="num text-right">{num(q.asked)}</td>
        <td className="num text-right">{num(q.responses)}</td>
        <td className="num text-right">{pct(q.answerRate)}</td>
        <td className="num text-right" title={t("confidence_title")}>{q.confidence === null ? "—" : Math.round(q.confidence)}</td>
        <td className="num text-right" title={t("consensus_title")}>{q.consensus === null ? "—" : Math.round(q.consensus)}</td>
        <td className="num text-right">
          {q.asked7d}
          <div className="text-xs text-subtle">{t("resp_short", { n: q.responses7d })}</div>
        </td>
        <td className="whitespace-nowrap text-[13px]">
          {day(q.lastAskedDay)}
          <div className="text-xs text-subtle">{ago(t, today, q.lastAskedDay)}</div>
        </td>
        <td className="whitespace-nowrap text-[13px]">
          {q.nextBatchDay ?? "—"}
          {q.state === "live" && q.askedPerDay14 > 0 && <div className="text-xs text-subtle">{t("per_day", { n: q.askedPerDay14 })}</div>}
          {q.pendingAccounts !== null && q.state !== "inactive" && <div className="text-xs text-subtle">{t("pending_n", { n: num(q.pendingAccounts) })}</div>}
        </td>
      </tr>
    </>
  );
}
