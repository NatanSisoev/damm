import Link from "next/link";
import { MIN_GROUP_SIZE } from "@damm/shared";
import { memo } from "@/lib/hr-memo";
import { getCommentThemes, listCollectius, listDomains, searchComments } from "@damm/db/hr";
import { getTL } from "@/lib/i18n/server";
import { collectiveLabel, domainLabel } from "@/lib/i18n/names";
import { numD } from "@/lib/i18n/num";
import { hrCommentsDict } from "@/lib/i18n/hr-comments";
import { Card, Empty, PageHeader } from "../ui";
import { LimitsNote } from "../limits-note";
import { AutoSubmitForm } from "../signals/auto-submit-form";
import "../signals/alarms.css";

export const dynamic = "force-dynamic";

type Params = { tema?: string; col?: string; dom?: string; per?: string; q?: string; p?: string };

const intOrNull = (s?: string) => (s && /^\d{1,6}$/.test(s) ? Number(s) : null);

export default async function CommentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const { t, lang } = await getTL(hrCommentsDict);
  const n0 = (v: number) => numD(v, lang, 0);

  const themes = memo("commentThemes", lang, () => getCommentThemes(lang));
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

  if (!themeKey) {
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
                  <th>{t("th_domains")}</th>
                </tr>
              </thead>
              <tbody>
                {themes.themes.map((th) => (
                  <tr key={th.key}>
                    <td>
                      <Link href={href({ tema: th.key })} className="font-semibold underline-offset-2 hover:underline" aria-label={t("view_theme", { name: th.etiqueta })}>
                        {th.etiqueta}
                      </Link>{" "}
                      {th.emergent && <span className="badge">{t("emergent")}</span>}
                    </td>
                    <td className="num">{n0(th.n)}</td>
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
      </div>
    );
  }

  const theme = themes.themes.find((x) => x.key === themeKey)!;
  const filtered = colId || domId || per || q;

  return (
    <div className="space-y-6">
      <PageHeader
        title={theme.etiqueta}
        aside={theme.emergent ? <span className="badge">{t("emergent")}</span> : undefined}
        subtitle={t("theme_sub", { n: n0(theme.n), min: MIN_GROUP_SIZE })}
        actions={<Link href="/hr/comments" className="btn">{t("all_themes")}</Link>}
      />

      <Card title={t("browse")} meta={result.n !== null ? t("count", { n: n0(result.n) }) : undefined}>
        <AutoSubmitForm key={JSON.stringify(sp)} method="get" action="/hr/comments" className="alarm-filters mb-4" aria-label={t("browse")}>
          <input type="hidden" name="tema" value={themeKey} />
          <label className="alarm-filter">
            <span>{t("f_collective")}</span>
            <select name="col" defaultValue={colId?.toString() ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {collectius.map((c) => <option key={c.id} value={c.id}>{collectiveLabel(c.nom, lang)}</option>)}
            </select>
          </label>
          <label className="alarm-filter">
            <span>{t("f_domain")}</span>
            <select name="dom" defaultValue={domId?.toString() ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {dominis.map((d) => <option key={d.id} value={d.id}>{domainLabel(d.nom, lang)}</option>)}
            </select>
          </label>
          <label className="alarm-filter">
            <span>{t("f_period")}</span>
            <select name="per" defaultValue={per ?? ""} className="input">
              <option value="">{t("f_all")}</option>
              {themes.periodes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="alarm-filter">
            <span>{t("f_search")}</span>
            <input type="search" name="q" defaultValue={q ?? ""} maxLength={80} placeholder={t("f_search_ph")} className="input" />
          </label>
          {filtered && (
            <div className="alarm-filter-actions">
              <Link href={href({ col: undefined, dom: undefined, per: undefined, q: undefined })} className="btn">{t("clear")}</Link>
            </div>
          )}
        </AutoSubmitForm>

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
                    {c.themes.filter((x) => x !== theme.etiqueta).map((x) => <span key={x} className="badge">{x}</span>)}
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
      <LimitsNote view="themes" />
    </div>
  );
}
