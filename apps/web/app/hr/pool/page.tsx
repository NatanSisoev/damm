import Link from "next/link";
import { QUESTION_TYPES } from "@damm/shared";
import { hrPool, type PoolQuestion } from "@/lib/hr-engine";
import { FoldAll, GroupBody } from "./group-body";
import { Empty, PageHeader, Stat } from "../ui";
import { questionTypeLabel } from "../labels";
import { REASON, STATE } from "./labels";

export const dynamic = "force-dynamic";

const GROUPS = [
  { key: "none", label: "Sense agrupar" },
  { key: "domain", label: "Domini" },
  { key: "type", label: "Format" },
  { key: "facet", label: "Faceta" },
  { key: "collective", label: "Col·lectiu" },
  { key: "need", label: "Necessitat" },
  { key: "state", label: "Estat" },
  { key: "source", label: "Origen" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

const SORTS = [
  { key: "id", label: "Ordre (#)" },
  { key: "asked", label: "Vegades demanada" },
  { key: "responses", label: "Respostes" },
  { key: "rate", label: "Taxa de resposta" },
  { key: "last", label: "Última vegada" },
  { key: "priority", label: "Prioritat" },
  { key: "pending", label: "Pendents de respondre" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

type Params = { page?: string; per?: string; q?: string; estat?: string; tipus?: string; domini?: string; col?: string; origen?: string; group?: string; sort?: string; dir?: string };

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const num = (x: number) => x.toLocaleString("ca-ES");
const day = (s: string | null) => (s ? s.slice(0, 10) : "—");

function ago(today: string, d: string | null): string {
  if (!d) return "mai";
  const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (n <= 0) return "avui";
  if (n === 1) return "ahir";
  return `fa ${n} dies`;
}

function groupOf(q: PoolQuestion, by: GroupKey): string {
  switch (by) {
    case "domain": return q.domain;
    case "type": return questionTypeLabel(q.type);
    case "facet": return q.facet ? `${q.domain} · ${q.facet}` : `${q.domain} · (sense faceta)`;
    case "collective": return q.collective;
    case "need": return q.needId === null ? "Monitoratge continu" : `Necessitat ${q.needId}: ${q.needTitle ?? ""}`;
    case "state": return STATE[q.state].label;
    case "source": return q.aiGenerated ? "Proposada per la IA" : "Escrita per una persona";
    default: return "";
  }
}

const SORT_FN: Record<SortKey, (q: PoolQuestion) => number> = {
  id: (q) => q.id,
  asked: (q) => q.asked,
  responses: (q) => q.responses,
  rate: (q) => q.answerRate ?? -1,
  last: (q) => (q.lastAskedDay ? Date.parse(q.lastAskedDay) : -1),
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
    const k = groupOf(q, group);
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
        title="Banc de preguntes"
        subtitle="Totes les preguntes que el motor pot fer, amb quantes vegades s'han demanat i respost, quan va ser l'última i quan tornaran a entrar en un lot. Només hi ha recomptes i agregats: mai respostes individuals."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Preguntes" value={num(s.counts.total)} hint={`${s.counts.live} en circulació · ${s.counts.waiting} en espera · ${s.counts.inactive} fora`} />
        <Stat label="Demanades" value={num(s.asked)} hint={`${num(s.asked7d)} els últims 7 dies`} />
        <Stat label="Respostes" value={num(s.responses)} hint={`${num(s.responses7d)} els últims 7 dies`} />
        <Stat label="Taxa de resposta" value={pct(s.answerRate)} hint="Assignacions respostes / assignades" />
        <Stat label="Lot diari" value={`${s.questionsPerDay} preguntes`} hint={`Una pregunta no es repeteix en ${s.itemCooldownDays} dies`} />
        <Stat label="Comptes" value={num(s.accounts)} hint={`Avui: ${s.today} (${s.timezone})`} />
      </div>

      <form method="get" action="/hr/pool" className="card mb-4">
        {p.per && <input type="hidden" name="per" value={p.per} />}
        <div className="card-body grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="col-span-2">
            <label htmlFor="q" className="label">Cerca</label>
            <input id="q" name="q" defaultValue={p.q ?? ""} placeholder="Text, faceta, # o necessitat" className="input w-full" />
          </div>
          <Select id="estat" label="Estat" value={p.estat} options={[["live", "En circulació"], ["waiting", "En espera"], ["inactive", "Fora del banc"]]} />
          <Select id="tipus" label="Format" value={p.tipus} options={QUESTION_TYPES.map((t) => [t, questionTypeLabel(t)])} />
          <Select id="domini" label="Domini" value={p.domini} options={domains.map(([id, nom]) => [String(id), nom])} />
          <Select id="col" label="Col·lectiu" value={p.col} options={collectives.map((c) => [c, c])} />
          <Select id="origen" label="Origen" value={p.origen} options={[["monitor", "Monitoratge continu"], ["need", "Necessitat d'RH"], ["followup", "Seguiment"]]} />
          <Select id="group" label="Agrupa per" value={group} options={GROUPS.map((g) => [g.key, g.label])} blank={false} />
          <Select id="sort" label="Ordena per" value={sort === "id" ? undefined : sort} options={SORTS.filter((x) => x.key !== "id").map((x) => [x.key, x.label])} />
          <Select id="dir" label="Sentit" value={p.dir} options={[["asc", "Ascendent"], ["desc", "Descendent"]]} />
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Aplica</button>
            <Link href="/hr/pool" className="btn btn-ghost">Neteja</Link>
          </div>
        </div>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-subtle" aria-live="polite">
        {filtered ? `${qs.length} de ${pool.questions.length} preguntes` : `${qs.length} preguntes`}
        {group !== "none" && ` · ${groups.size} grups per ${GROUPS.find((g) => g.key === group)!.label.toLowerCase()}`}
      </p>
      {group !== "none" && <FoldAll />}
      </div>

      {qs.length === 0 ? (
        <Empty>Cap pregunta coincideix amb els filtres.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[70rem]">
            <thead>
              <tr>
                <th>Pregunta</th>
                <th>Estat</th>
                <th>Domini · col·lectiu</th>
                <SortTh p={p} k="asked" cur={sort} dir={dir}>Demanada</SortTh>
                <SortTh p={p} k="responses" cur={sort} dir={dir}>Respostes</SortTh>
                <SortTh p={p} k="rate" cur={sort} dir={dir}>Taxa</SortTh>
                <th className="text-right">7 dies</th>
                <SortTh p={p} k="last" cur={sort} dir={dir} left>Última vegada</SortTh>
                <th>Pròxim lot</th>
              </tr>
            </thead>
            {[...groups.entries()].filter(([, list]) => list.some((q) => shown.has(q.id))).map(([name, list]) => (
              group === "none" ? (
                <tbody key="all">
                  {list.filter((q) => shown.has(q.id)).map((q) => (
                    <QuestionRows key={q.id} q={q} today={s.today} minGroup={s.minGroupSize} />
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
                        {list.length} {list.length === 1 ? "pregunta" : "preguntes"} · {num(list.reduce((n, q) => n + q.asked, 0))} demanades · {num(list.reduce((n, q) => n + q.responses, 0))} respostes · {pct(list.reduce((n, q) => n + q.asked, 0) > 0 ? list.reduce((n, q) => n + q.answeredAssigned, 0) / list.reduce((n, q) => n + q.asked, 0) : null)}
                      </span>
                    </span>
                  }
                >
                  {list.filter((q) => shown.has(q.id)).map((q) => (
                    <QuestionRows key={q.id} q={q} today={s.today} minGroup={s.minGroupSize} />
                  ))}
                </GroupBody>
              )
            ))}
          </table>
        </div>
      )}
      {qs.length > 0 && (
        <nav aria-label="Pàgines" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-subtle num">
            {(page - 1) * per + 1}–{Math.min(page * per, ordered.length)} de {ordered.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-subtle">Per pàgina</span>
            {PER.map((n) => (
              <Link key={n} href={href(p, { per: n === 50 ? undefined : String(n), page: undefined })} aria-current={n === per ? "true" : undefined} className={`px-2 py-1 ${n === per ? "font-bold underline" : ""}`}>{n}</Link>
            ))}
            <span className="mx-2" />
            {page > 1 ? <Link href={href(p, { page: String(page - 1) })} rel="prev" className="btn btn-ghost border border-line-strong px-3 py-1.5">← Anterior</Link> : <span className="px-3 py-1.5 text-subtle">← Anterior</span>}
            <span className="num px-2">Pàgina {page} de {pages}</span>
            {page < pages ? <Link href={href(p, { page: String(page + 1) })} rel="next" className="btn btn-ghost border border-line-strong px-3 py-1.5">Següent →</Link> : <span className="px-3 py-1.5 text-subtle">Següent →</span>}
          </div>
        </nav>
      )}
    </div>
  );
}

function Select({ id, label, value, options, blank = true }: { id: string; label: string; value?: string; options: ReadonlyArray<readonly [string, string]>; blank?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} name={id} defaultValue={value ?? ""} className="input w-full">
        {blank && <option value="">{id === "group" || id === "sort" || id === "dir" ? "—" : "Tots"}</option>}
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

function QuestionRows({ q, today, minGroup }: { q: PoolQuestion; today: string; minGroup: number }) {
  const st = STATE[q.state];
  return (
    <>
      <tr className="pool-row">
        <td className="max-w-[26rem]">
          <div className="text-[13px] leading-snug">
            <Link href={`/hr/pool/${q.id}`} className="pool-link">{q.text}</Link>
          </div>
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
            <span className="badge">{questionTypeLabel(q.type)}</span>
            {q.facet && <span className="badge" title="Faceta: allò que la pregunta mesura realment">{q.facet}</span>}
            {q.needId !== null && <span className="badge badge-accent" title={q.needTitle ?? undefined}>Necessitat {q.needId}</span>}
            {q.isFollowup && <span className="badge">Seguiment</span>}
            {q.polarity === -1 && <span className="badge" title="Redactada en negatiu: la puntuació s'inverteix">Negativa</span>}
            {q.aiGenerated && <span className="badge" title="Proposada per la IA i aprovada per una persona">IA</span>}
          </div>
        </td>
        <td>
          <span className={`badge ${st.cls}`}>{st.label}</span>
          <div className="mt-1 max-w-[12rem] text-xs text-subtle">{REASON[q.reason]}</div>
        </td>
        <td className="text-[13px]">
          {q.domain}
          <div className="text-xs text-subtle">{q.collective}</div>
        </td>
        <td className="num text-right">{num(q.asked)}</td>
        <td className="num text-right">{num(q.responses)}</td>
        <td className="num text-right">{pct(q.answerRate)}</td>
        <td className="num text-right">
          {q.asked7d}
          <div className="text-xs text-subtle">{q.responses7d} resp.</div>
        </td>
        <td className="whitespace-nowrap text-[13px]">
          {day(q.lastAskedDay)}
          <div className="text-xs text-subtle">{ago(today, q.lastAskedDay)}</div>
        </td>
        <td className="whitespace-nowrap text-[13px]">
          {q.nextBatchDay ?? "—"}
          {q.state === "live" && q.askedPerDay14 > 0 && <div className="text-xs text-subtle">~{q.askedPerDay14}/dia</div>}
          {q.pendingAccounts !== null && q.state !== "inactive" && <div className="text-xs text-subtle">{num(q.pendingAccounts)} pendents</div>}
        </td>
      </tr>
    </>
  );
}
