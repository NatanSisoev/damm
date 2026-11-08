import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { getCommentThemes, listCollectius, listDomains, searchComments } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { collectiveLabel, domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { hrCommentsDict } from "@/lib/i18n/hr-comments";
import { Card, Empty, PageHeader } from "../ui";

export const dynamic = "force-dynamic";

type Params = { tema?: string; col?: string; dom?: string; per?: string; q?: string; p?: string };

const intOrNull = (s?: string) => (s && /^\d{1,6}$/.test(s) ? Number(s) : null);

export default async function CommentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const { t, lang } = await getTL(hrCommentsDict);
  const n0 = (v: number) => numD(v, lang, 0);

  const themes = getCommentThemes(lang);
  const collectius = listCollectius();
  const dominis = listDomains();

  const themeKey = sp.tema && themes.themes.some((x) => x.key === sp.tema) ? sp.tema : null;
  const colId = intOrNull(sp.col);
  const domId = intOrNull(sp.dom);
  const per = sp.per && themes.periodes.includes(sp.per) ? sp.per : null;
  const q = (sp.q ?? "").trim().slice(0, 80) || null;
  const page = Math.max(1, intOrNull(sp.p) ?? 1);

  const result = searchComments({ themeKey, collectiuId: colId, dominiId: domId, periode: per, q }, page, lang);

  const href = (over: Partial<Params>) => {
    const u = new URLSearchParams();
    const cur: Params = { tema: themeKey ?? undefined, col: colId?.toString(), dom: domId?.toString(), per: per ?? undefined, q: q ?? undefined, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) u.set(k, v);
    const s = u.toString();
    return `/hr/comments${s ? `?${s}` : ""}`;
  };
  const cell = (c: number | null) => (c === null ? t("lt_min", { min: MIN_GROUP_SIZE }) : n0(c));

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("sub", { min: MIN_GROUP_SIZE })} />

      <Card title={t("themes")} meta={themes.total !== null ? t("themes_meta", { n: n0(themes.total) }) : undefined} flush>
        {themes.themes.length === 0 ? (
          <div className="p-4"><Empty>{t("no_themes")}</Empty></div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("th_theme")}</th>
                <th className="num">{t("th_total")}</th>
                {themes.periodes.map((p) => <th key={p} className="num">{p}</th>)}
                <th>{t("th_collectives")}</th>
                <th>{t("th_domains")}</th>
              </tr>
            </thead>
            <tbody>
              {themes.themes.map((th) => (
                <tr key={th.key}>
                  <td>
                    <Link href={href({ tema: th.key, p: undefined })} className="underline" aria-label={t("view_theme", { name: th.etiqueta })}>
                      {th.etiqueta}
                    </Link>{" "}
                    {th.emergent && <span className="badge">{t("emergent")}</span>}
                  </td>
                  <td className="num">{n0(th.n)}</td>
                  {themes.periodes.map((p) => {
                    const c = th.periods.find((x) => x.periode === p);
                    return <td key={p} className="num">{c ? cell(c.n) : cell(null)}</td>;
                  })}
                  <td>
                    {th.collectives.map((c) => (
                      <span key={c.label} className="badge mr-1">{collectiveLabel(c.label, lang)} {cell(c.n)}</span>
                    ))}
                  </td>
                  <td>
                    {th.domains.map((d) => (
                      <span key={d.label} className="badge mr-1">{domainLabel(d.label, lang)} {cell(d.n)}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {themes.hiddenThemes > 0 && (
          <p className="px-4 py-3 text-xs text-subtle">{t("hidden_themes", { n: themes.hiddenThemes, min: MIN_GROUP_SIZE })}</p>
        )}
      </Card>

      <Card title={t("browse")} meta={result.n !== null ? t("count", { n: n0(result.n) }) : undefined}>
        <form method="get" action="/hr/comments" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="label">{t("f_theme")}</span>
            <select name="tema" defaultValue={themeKey ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {themes.themes.map((x) => <option key={x.key} value={x.key}>{x.etiqueta}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("f_collective")}</span>
            <select name="col" defaultValue={colId?.toString() ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {collectius.map((c) => <option key={c.id} value={c.id}>{collectiveLabel(c.nom, lang)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("f_domain")}</span>
            <select name="dom" defaultValue={domId?.toString() ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {dominis.map((d) => <option key={d.id} value={d.id}>{domainLabel(d.nom, lang)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("f_period")}</span>
            <select name="per" defaultValue={per ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {themes.periodes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("f_search")}</span>
            <input name="q" defaultValue={q ?? ""} maxLength={80} placeholder={t("f_search_ph")} className="input" />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn btn-primary">{t("apply")}</button>
            <Link href="/hr/comments" className="btn btn-ghost">{t("clear")}</Link>
          </div>
        </form>

        {result.suppressed ? (
          <Empty>{t("suppressed", { min: MIN_GROUP_SIZE })}</Empty>
        ) : result.comments.length === 0 ? (
          <Empty>{t("empty")}</Empty>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {result.comments.map((c, i) => (
                <li key={i} className="py-3">
                  <p>{c.text}</p>
                  <p className="mt-1 flex flex-wrap gap-1 text-xs text-subtle">
                    {c.periode && <span className="badge">{c.periode}</span>}
                    {c.collectiu && <span className="badge">{collectiveLabel(c.collectiu, lang)}</span>}
                    {c.domini && <span className="badge">{domainLabel(c.domini, lang)}</span>}
                    {c.themes.map((x) => <span key={x} className="badge">{x}</span>)}
                  </p>
                </li>
              ))}
            </ul>
            <nav aria-label={t("pages_aria")} className="mt-4 flex items-center justify-between text-sm">
              <span className="text-subtle">{t("page_of", { p: result.page, n: result.pages })}</span>
              <span className="flex gap-2">
                {result.page > 1 && <Link className="btn" href={href({ p: String(result.page - 1) })}>{t("prev")}</Link>}
                {result.page < result.pages && <Link className="btn" href={href({ p: String(result.page + 1) })}>{t("next")}</Link>}
              </span>
            </nav>
            <p className="mt-3 text-xs text-subtle">{t("shuffled")}</p>
          </>
        )}
      </Card>
    </div>
  );
}
