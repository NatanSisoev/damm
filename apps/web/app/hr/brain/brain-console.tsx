"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { QuestionType } from "@damm/shared";
import type { Brain, BrainCollective, SimResult } from "@/lib/hr-engine";
import { Card, Empty, SuppressedBadge } from "../ui";
import { recomputeAction } from "../actions";
import { refreshBrainAction, resetConfigAction, saveConfigAction, saveWeightsAction, simulateAction } from "./actions";
import { CLOSED_TYPES, FORMAT_KEYS, PARAM_GROUPS, REASON_KEYS, WEIGHT_SOURCE_KEYS, type ParamMeta } from "./meta";
import { useLang, useT } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n/core";
import { brainDict, type BrainKey } from "@/lib/i18n/hr-brain";
import { collectiveLabel, domainLabel, shiftLabel } from "@/lib/i18n/names";

type Tab = "summary" | "params" | "weights" | "sim";
const TABS: { key: Tab; label: BrainKey }[] = [
  { key: "summary", label: "tab_summary" },
  { key: "params", label: "tab_params" },
  { key: "weights", label: "tab_weights" },
  { key: "sim", label: "tab_sim" },
];

/** What a slider shows: the numeric rules from meta.ts with the texts already translated. */
type SliderMeta = Omit<ParamMeta, "unit"> & { label: string; hint: string; unit?: string };

/** Translator plus number formats in the UI language. */
function useBx() {
  const t = useT(brainDict);
  const lang = useLang();
  const nf = (d: number) => new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const fmt = (v: number, d = 2) => nf(d).format(v);
  const pct = (v: number, d = 0) => `${nf(d).format(v * 100)}${lang === "en" ? "%" : " %"}`;
  return { t, lang, fmt, pct };
}

type Draft = Record<string, unknown>;

function Bar({ value, max = 1, tone = "accent" }: { value: number; max?: number; tone?: "accent" | "muted" | "warn" }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bg = tone === "warn" ? "var(--warn)" : tone === "muted" ? "var(--dom-muted)" : "var(--accent)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: bg }} />
    </div>
  );
}

function Slider({ meta, value, saved, onChange }: { meta: SliderMeta; value: number; saved: number; onChange: (v: number) => void }) {
  const { t, fmt } = useBx();
  const changed = value !== saved;
  const id = `p-${meta.key}`;
  return (
    <div className={`rounded-lg border px-4 py-3 ${changed ? "border-line-strong bg-accent-soft" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[14px] font-semibold">{meta.label}</label>
        <span className="flex items-center gap-2">
          {changed && <span className="badge" title={t("saved_val", { v: fmt(saved, 4) })}>{t("changed")}</span>}
          <input
            type="number" className="input num w-28 text-right" min={meta.min} max={meta.max} step={meta.step} value={value}
            aria-label={t("value_aria", { label: meta.label })}
            onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
          />
          {meta.unit && <span className="text-xs text-subtle">{meta.unit}</span>}
        </span>
      </div>
      <input
        id={id} type="range" className="mt-2 w-full accent-[var(--accent)]" min={meta.min} max={meta.max} step={meta.step} value={Math.min(meta.max, Math.max(meta.min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="mt-1 text-xs text-subtle">{meta.hint}</p>
    </div>
  );
}

function MixRow({ label, saved, draft, max }: { label: ReactNode; saved: number; draft: number; max: number }) {
  const { fmt, pct } = useBx();
  const delta = draft - saved;
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,12rem)_1fr_6rem]">
      <span className="truncate">{label}</span>
      <div className="space-y-1">
        <Bar value={draft} max={max} />
        <Bar value={saved} max={max} tone="muted" />
      </div>
      <span className="num text-right">
        {pct(draft, 1)}
        <span className={`block text-[11px] ${Math.abs(delta) < 0.005 ? "text-subtle" : delta > 0 ? "text-[var(--good)]" : "text-[var(--warn)]"}`}>
          {Math.abs(delta) < 0.0005 ? "=" : `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta) * 100, 1)} pp`}
        </span>
      </span>
    </div>
  );
}

export function BrainConsole({ initial }: { initial: Brain }) {
  const { t, lang, fmt } = useBx();
  const [brain, setBrain] = useState(initial);
  const [tab, setTab] = useState<Tab>("summary");
  const [collectiuId, setCollectiuId] = useState(initial.collectives[0]?.id ?? 0);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, startBusy] = useTransition();

  const savedConfig = useMemo<Draft>(() => Object.fromEntries(brain.config.map((c) => [c.key, c.value])), [brain.config]);
  const [configDraft, setConfigDraft] = useState<Draft>(savedConfig);
  // Draft weights for the collectives touched so far; untouched collectives show what is saved.
  const [weightDrafts, setWeightDrafts] = useState<Record<number, { domains: Record<number, number>; formats: Partial<Record<QuestionType, number>> }>>({});

  const collective = brain.collectives.find((c) => c.id === collectiuId) ?? brain.collectives[0];
  const draftWeights = collective ? (weightDrafts[collective.id] ?? { domains: {}, formats: {} }) : { domains: {}, formats: {} };
  const weightOf = (d: number) => draftWeights.domains[d] ?? collective?.domains.find((x) => x.domainId === d)?.weight ?? 1;
  const prefOf = (t: QuestionType) => draftWeights.formats[t] ?? collective?.formats.find((x) => x.type === t)?.preference ?? 1;

  const changedKeys = Object.keys(savedConfig).filter((k) => JSON.stringify(configDraft[k]) !== JSON.stringify(savedConfig[k]));
  const changedWeights = Object.keys(draftWeights.domains).filter((d) => draftWeights.domains[Number(d)] !== collective?.domains.find((x) => x.domainId === Number(d))?.weight).length
    + Object.keys(draftWeights.formats).filter((t) => draftWeights.formats[t as QuestionType] !== collective?.formats.find((x) => x.type === t)?.preference).length;
  const dirty = changedKeys.length > 0 || changedWeights > 0;

  const apply = (r: Awaited<ReturnType<typeof saveConfigAction>>, ok: string, after?: () => void) => {
    if (r.ok) {
      setBrain(r.brain);
      after?.();
      setMsg({ tone: "ok", text: ok });
    } else setMsg({ tone: "err", text: r.error });
  };

  const syncDraft = (b: Brain) => setConfigDraft(Object.fromEntries(b.config.map((c) => [c.key, c.value])));

  const saveConfig = () =>
    startBusy(async () => {
      const patch = Object.fromEntries(changedKeys.map((k) => [k, configDraft[k]]));
      const r = await saveConfigAction(patch);
      apply(r, changedKeys.length === 1 ? t("saved_one") : t("saved_many", { n: changedKeys.length }));
    });

  const resetConfig = (keys?: string[]) =>
    startBusy(async () => {
      const r = await resetConfigAction(keys);
      if (r.ok) syncDraft(r.brain);
      apply(r, keys ? t("reset_one") : t("reset_all_done"));
    });

  const saveWeights = () =>
    startBusy(async () => {
      if (!collective) return;
      const r = await saveWeightsAction(collective.id, draftWeights.domains, draftWeights.formats);
      apply(r, t("weights_saved", { name: collectiveLabel(collective.name, lang) }), () => setWeightDrafts((w) => ({ ...w, [collective.id]: { domains: {}, formats: {} } })));
    });

  const clearWeight = (kind: "domain" | "format", key: number | QuestionType) =>
    startBusy(async () => {
      if (!collective) return;
      const r = kind === "domain" ? await saveWeightsAction(collective.id, { [key as number]: null }, {}) : await saveWeightsAction(collective.id, {}, { [key as QuestionType]: null });
      apply(r, t("back_general"), () =>
        setWeightDrafts((w) => {
          const cur = w[collective.id];
          if (!cur) return w;
          const domains = { ...cur.domains };
          const formats = { ...cur.formats };
          if (kind === "domain") delete domains[key as number];
          else delete formats[key as QuestionType];
          return { ...w, [collective.id]: { domains, formats } };
        }),
      );
    });

  const discard = () => {
    setConfigDraft(savedConfig);
    setWeightDrafts({});
    setMsg(null);
  };

  const recompute = () =>
    startBusy(async () => {
      await recomputeAction();
      const r = await refreshBrainAction();
      apply(r, t("recomputed"));
    });

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
          <span>{t("engine")} <strong className="num text-ink">v{brain.version}</strong></span>
          <span>{t("today")} <strong className="num text-ink">{brain.day}</strong> ({brain.timezone})</span>
          <span>{t("last_run")} <strong className="num text-ink">{brain.lastJobAt ?? t("none")}</strong></span>
          <span>{t("min_group")} <strong className="num text-ink">{brain.minGroupSize}</strong> <span className="text-subtle">{t("min_group_fixed")}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="coll" className="text-subtle">{t("collective")}</label>
          <select id="coll" className="input" value={collective?.id} onChange={(e) => setCollectiuId(Number(e.target.value))}>
            {brain.collectives.map((c) => <option key={c.id} value={c.id}>{collectiveLabel(c.name, lang)}</option>)}
          </select>
          <button type="button" className="btn btn-ghost" onClick={recompute} disabled={busy}>{t("recompute")}</button>
        </div>
      </div>

      <div role="tablist" aria-label={t("tabs_aria")} className="flex flex-wrap gap-2 border-b border-line pb-2">
        {TABS.map((tb) => (
          <button
            key={tb.key} role="tab" type="button" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)}
            className={`btn ${tab === tb.key ? "btn-primary" : "btn-ghost"}`}
          >
            {t(tb.label)}
            {tb.key === "params" && changedKeys.length > 0 && <span className="badge ml-2">{changedKeys.length}</span>}
            {tb.key === "weights" && changedWeights > 0 && <span className="badge ml-2">{changedWeights}</span>}
          </button>
        ))}
      </div>

      {dirty && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-line-strong px-5 py-3 text-[13px]" role="status">
          <span>{t("dirty")}</span>
          <button type="button" className="btn btn-ghost" onClick={discard}>{t("discard")}</button>
        </div>
      )}
      {msg && (
        <p role={msg.tone === "err" ? "alert" : "status"} className={`text-[13px] ${msg.tone === "err" ? "text-[var(--warn)]" : "text-[var(--good)]"}`}>{msg.text}</p>
      )}

      {tab === "summary" && collective && <Summary brain={brain} c={collective} />}

      {tab === "params" && (
        <div className="space-y-6">
          {PARAM_GROUPS.map((g) => (
            <Card key={g.id} title={t(`grp_${g.id}_title` as BrainKey)} meta={t(`grp_${g.id}_intro` as BrainKey)}>
              <div className="grid gap-3 lg:grid-cols-2">
                {g.params.map((p) => (
                  <div key={p.key} className="space-y-1">
                    <Slider
                      meta={{ ...p, label: t(`p_${p.key}_label` as BrainKey), hint: t(`p_${p.key}_hint` as BrainKey), unit: p.unit && t(p.unit) }} value={Number(configDraft[p.key])} saved={Number(savedConfig[p.key])}
                      onChange={(v) => setConfigDraft((d) => ({ ...d, [p.key]: v }))}
                    />
                    {brain.config.find((c) => c.key === p.key)?.overridden && (
                      <button type="button" className="text-xs text-subtle underline" onClick={() => resetConfig([p.key])} disabled={busy}>
                        {t("back_default", { v: fmt(Number(brain.config.find((c) => c.key === p.key)!.default), 4) })}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <Card title={t("noise_title")} meta={t("noise_meta")}>
            <div className="grid gap-3 lg:grid-cols-2">
              {CLOSED_TYPES.map((ty) => {
                const cur = configDraft.noise_sd as Record<string, number>;
                const sv = savedConfig.noise_sd as Record<string, number>;
                return (
                  <Slider
                    key={ty} meta={{ key: `noise_${ty}`, label: t(FORMAT_KEYS[ty]), hint: t("noise_hint"), min: 0.02, max: 0.5, step: 0.01 }}
                    value={cur[ty]!} saved={sv[ty]!} onChange={(v) => setConfigDraft((d) => ({ ...d, noise_sd: { ...(d.noise_sd as object), [ty]: v } }))}
                  />
                );
              })}
            </div>
          </Card>
          <Card title={t("priors_title")} meta={t("priors_meta")}>
            <div className="grid gap-3 lg:grid-cols-2">
              <Slider
                meta={{ key: "prior_level", label: t("prior_level_label"), hint: t("prior_level_hint"), min: 0, max: 1, step: 0.01 }}
                value={(configDraft.priors as { level: number }).level} saved={(savedConfig.priors as { level: number }).level}
                onChange={(v) => setConfigDraft((d) => ({ ...d, priors: { ...(d.priors as object), level: v } }))}
              />
              <Slider
                meta={{ key: "prior_variance", label: t("prior_variance_label"), hint: t("prior_variance_hint"), min: 0.005, max: 0.25, step: 0.005 }}
                value={(configDraft.priors as { variance: number }).variance} saved={(savedConfig.priors as { variance: number }).variance}
                onChange={(v) => setConfigDraft((d) => ({ ...d, priors: { ...(d.priors as object), variance: v } }))}
              />
            </div>
          </Card>
          <Card title={t("trigger_title")} meta={t("trigger_meta")}>
            <div className="flex flex-wrap gap-4">
              {CLOSED_TYPES.map((ty) => {
                const list = configDraft.followup_trigger_types as string[];
                return (
                  <label key={ty} className="flex items-center gap-2 text-[14px]">
                    <input
                      type="checkbox" checked={list.includes(ty)}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, followup_trigger_types: e.target.checked ? [...list, ty] : list.filter((x) => x !== ty) }))}
                    />
                    {t(FORMAT_KEYS[ty])}
                  </label>
                );
              })}
            </div>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={saveConfig} disabled={busy || changedKeys.length === 0}>
              {changedKeys.length ? t("save_params_n", { n: changedKeys.length }) : t("save_params")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={!dirty}>{t("discard")}</button>
            <button
              type="button" className="btn btn-ghost" disabled={busy || !brain.config.some((c) => c.overridden)}
              onClick={() => confirm(t("reset_confirm")) && resetConfig()}
            >
              {t("reset_all_btn")}
            </button>
          </div>
        </div>
      )}

      {tab === "weights" && collective && (
        <div className="space-y-6">
          <Card title={t("weights_of", { name: collectiveLabel(collective.name, lang) })} meta={t("weights_meta")}>
            <div className="space-y-3">
              {brain.domains.map((d) => {
                const dom = collective.domains.find((x) => x.domainId === d.id)!;
                return (
                  <div key={d.id} className="space-y-1">
                    <Slider
                      meta={{ key: `w_${d.id}`, label: domainLabel(d.name, lang), hint: t("weight_hint", { src: t(WEIGHT_SOURCE_KEYS[dom.weightSource]!) }), min: 0.1, max: 5, step: 0.1 }}
                      value={weightOf(d.id)} saved={dom.weight}
                      onChange={(v) => setWeightDrafts((w) => ({ ...w, [collective.id]: { ...draftWeights, domains: { ...draftWeights.domains, [d.id]: v } } }))}
                    />
                    {dom.weightSource === "collective" && (
                      <button type="button" className="text-xs text-subtle underline" onClick={() => clearWeight("domain", d.id)} disabled={busy}>{t("remove_own")}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title={t("formats")} meta={t("formats_weights_meta")}>
            <div className="grid gap-3 lg:grid-cols-2">
              {(Object.keys(FORMAT_KEYS) as QuestionType[]).map((ty) => {
                const f = collective.formats.find((x) => x.type === ty)!;
                return (
                  <div key={ty} className="space-y-1">
                    <Slider
                      meta={{ key: `f_${ty}`, label: t("format_weight_label", { label: t(FORMAT_KEYS[ty]), n: f.questions }), hint: t("format_weight_hint", { src: t(WEIGHT_SOURCE_KEYS[f.preferenceSource]!) }), min: 0, max: 3, step: 0.1 }}
                      value={prefOf(ty)} saved={f.preference}
                      onChange={(v) => setWeightDrafts((w) => ({ ...w, [collective.id]: { ...draftWeights, formats: { ...draftWeights.formats, [ty]: v } } }))}
                    />
                    {f.preferenceSource === "collective" && (
                      <button type="button" className="text-xs text-subtle underline" onClick={() => clearWeight("format", ty)} disabled={busy}>{t("remove_own")}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="flex gap-3">
            <button type="button" className="btn btn-primary" onClick={saveWeights} disabled={busy || changedWeights === 0}>{t("save_weights", { name: collectiveLabel(collective.name, lang) })}</button>
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={!dirty}>{t("discard")}</button>
          </div>
        </div>
      )}

      {tab === "sim" && collective && (
        <Simulator
          brain={brain} c={collective} changedKeys={changedKeys} configDraft={configDraft}
          weights={{ domains: Object.fromEntries(brain.domains.map((d) => [d.id, weightOf(d.id)])), formats: Object.fromEntries((Object.keys(FORMAT_KEYS) as QuestionType[]).map((ty) => [ty, prefOf(ty)])) }}
        />
      )}
    </div>
  );
}

// --- Estat -----------------------------------------------------------------------------------

function Summary({ brain, c }: { brain: Brain; c: BrainCollective }) {
  const { t, lang, fmt, pct } = useBx();
  const maxShare = Math.max(0.01, ...c.domains.map((d) => d.drawShare));
  const maxGain = Math.max(1e-9, ...c.domains.map((d) => d.stats?.infoGain ?? 0));
  return (
    <div className="space-y-6">

      <Card title={t("attn_title")} meta={t("attn_meta")}>
        {c.suppressed && <p className="mb-3 text-[13px] text-subtle">{t("suppressed_note", { n: brain.minGroupSize })}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-subtle">
              <tr>
                <th className="py-2 pr-3 font-semibold">{t("th_domain")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_score")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_confidence")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_consensus")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_gain")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_jumps")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_weight")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_first")}</th>
              </tr>
            </thead>
            <tbody>
              {c.domains.map((d) => (
                <tr key={d.domainId} className="border-t border-line align-middle">
                  <td className="py-2 pr-3 font-semibold">{domainLabel(d.name, lang)}<span className="block text-xs font-normal text-subtle">{t("n_questions", { n: d.questions })}</span></td>
                  <td className="num py-2 pr-3">{d.stats ? fmt(d.stats.score, 1) : <SuppressedBadge label={t("suppressed")} />}</td>
                  <td className="num py-2 pr-3">{d.stats ? `${fmt(d.stats.confidence, 0)} %` : "—"}</td>
                  <td className="num py-2 pr-3">{d.stats ? `${fmt(d.stats.consensus, 0)} %` : "—"}</td>
                  <td className="py-2 pr-3 w-36">{d.stats ? <Bar value={d.stats.infoGain} max={maxGain} /> : "—"}</td>
                  <td className="num py-2 pr-3">{d.stats ? (d.stats.recent ? pct(d.stats.outlierShare, 1) : "—") : "—"}</td>
                  <td className="num py-2 pr-3">
                    {fmt(d.weight, 1)}
                    {d.probeBoost > 1 && <span className="badge badge-accent ml-1" title={t("probe_active")}>×{fmt(d.probeBoost, 1)}</span>}
                  </td>
                  <td className="py-2 pr-3 w-48">
                    <div className="flex items-center gap-2"><Bar value={d.drawShare} max={maxShare} /><span className="num w-12 text-right">{pct(d.drawShare)}</span></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-subtle">
          {t("gain_note")}{" "}
          {t("rows_note", { n: brain.minGroupSize })}
        </p>
      </Card>

      <Card title={t("formats")} meta={t("formats_meta")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-subtle">
              <tr>
                <th className="py-2 pr-3 font-semibold">{t("th_format")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_questions")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_preference")}</th>
                <th className="py-2 pr-3 font-semibold">{t("th_attentive")}</th>
              </tr>
            </thead>
            <tbody>
              {c.formats.map((f) => (
                <tr key={f.type} className="border-t border-line align-middle">
                  <td className="py-2 pr-3 font-semibold">{t(FORMAT_KEYS[f.type])}</td>
                  <td className="num py-2 pr-3">{f.questions}</td>
                  <td className="num py-2 pr-3">{f.preference === 0 ? <span className="badge badge-warn">{t("forbidden")}</span> : fmt(f.preference, 1)}</td>
                  <td className="py-2 pr-3">
                    {f.arms.length === 0 ? <span className="text-subtle">{t("no_data")}</span> : (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {f.arms.map((a) => (
                          <span key={a.tornId} className="num">
                            {shiftLabel(a.shift, lang)}: <strong>{c.suppressed ? "—" : pct(a.mean)}</strong>
                            <span className="text-xs text-subtle"> {t("obs", { n: a.observations })}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t("probes_title")} meta={t("probes_meta")}>
        {brain.probes.length === 0 ? <Empty>{t("no_probes")}</Empty> : (
          <ul className="space-y-1 text-[13px]">
            {brain.probes.map((p) => (
              <li key={p.id}><strong>{collectiveLabel(p.collective, lang)}</strong>{p.shift ? ` · ${shiftLabel(p.shift, lang)}` : ""} · {domainLabel(p.domain, lang)} · {t("probe_until", { boost: fmt(p.boost, 1), date: p.endsAt.slice(0, 10) })}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-xs font-semibold text-subtle">{label}</div>
      <div className="num mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </div>
  );
}

// --- Simulador i cua -------------------------------------------------------------------------

function Simulator({
  brain, c, changedKeys, configDraft, weights,
}: {
  brain: Brain;
  c: BrainCollective;
  changedKeys: string[];
  configDraft: Draft;
  weights: { domains: Record<string, number>; formats: Record<string, number> };
}) {
  const { t, lang, fmt, pct } = useBx();
  const [days, setDays] = useState(14);
  const [people, setPeople] = useState(100);
  const [tornId, setTornId] = useState<number | null>(null);
  const [seed, setSeed] = useState("brain");
  const [probe, setProbe] = useState<{ domainId: number; boost: number } | null>(null);
  const [res, setRes] = useState<{ draft: SimResult; saved: SimResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneKey, setDoneKey] = useState("");
  const run = useRef(0);

  const config = useMemo(() => Object.fromEntries(changedKeys.map((k) => [k, configDraft[k]])), [changedKeys, configDraft]);
  const key = JSON.stringify([c.id, tornId, days, people, seed, config, weights, probe]);

  useEffect(() => {
    const id = ++run.current;
    const t = setTimeout(async () => {
      const r = await simulateAction({
        collectiuId: c.id, tornId, days, people, seed, config,
        domainWeights: Object.fromEntries(Object.entries(weights.domains).map(([k, v]) => [Number(k), v])),
        formatPreferences: weights.formats,
        probeBoosts: probe ? { [probe.domainId]: probe.boost } : {},
      });
      if (id !== run.current) return;
      setDoneKey(key);
      if (r.ok) {
        setRes(r);
        setError(null);
      } else setError(r.error);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reasons = ["monitor", "need", "followup"] as const;
  const maxDomain = res ? Math.max(0.01, ...res.draft.domainMix.map((d) => d.share), ...res.saved.domainMix.map((d) => d.share)) : 1;
  const types = res ? [...new Set([...res.draft.typeMix, ...res.saved.typeMix].map((x) => x.type))] : [];
  const shareOf = (r: SimResult, ty: QuestionType) => r.typeMix.find((x) => x.type === ty)?.share ?? 0;
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALES[lang], { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <Card title={t("try_title")} meta={t("try_meta")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="sim-days">{t("sim_days")}</label>
            <input id="sim-days" type="number" className="input num w-full" min={1} max={28} value={days} onChange={(e) => setDays(Math.max(1, Math.min(28, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label className="label" htmlFor="sim-people">{t("sim_people")}</label>
            <input id="sim-people" type="number" className="input num w-full" min={1} max={300} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label className="label" htmlFor="sim-shift">{t("sim_shift")}</label>
            <select id="sim-shift" className="input w-full" value={tornId ?? ""} onChange={(e) => setTornId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t("sim_no_shift")}</option>
              {brain.shifts.map((s) => <option key={s.id} value={s.id}>{shiftLabel(s.name, lang)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sim-probe">{t("sim_probe")}</label>
            <div className="flex gap-2">
              <select id="sim-probe" className="input min-w-0 flex-1" value={probe?.domainId ?? ""} onChange={(e) => setProbe(e.target.value ? { domainId: Number(e.target.value), boost: probe?.boost ?? 3 } : null)}>
                <option value="">{t("sim_none")}</option>
                {brain.domains.map((d) => <option key={d.id} value={d.id}>{domainLabel(d.name, lang)}</option>)}
              </select>
              {probe && <input type="number" aria-label={t("sim_multiplier")} className="input num w-16" min={1.5} max={10} step={0.5} value={probe.boost} onChange={(e) => setProbe({ ...probe, boost: Number(e.target.value) || 2 })} />}
            </div>
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn-ghost w-full" onClick={() => setSeed(Math.random().toString(36).slice(2, 7))}>{t("sim_shuffle")}</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-subtle" aria-live="polite">
          {doneKey !== key && `${t("calculating")} `}{t("bars_note")}
          {res?.draft.neutralSignals && ` ${t("neutral_note", { n: brain.minGroupSize })}`}
        </p>
        {error && <p role="alert" className="mt-2 text-[13px] text-[var(--warn)]">{error}</p>}
      </Card>

      {res && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t("fact_per_day")} value={fmt(res.draft.slotsPerDay, 2)} hint={t("saved_prefix", { v: fmt(res.saved.slotsPerDay, 2) })} />
            <Fact label={t("fact_distinct")} value={`${res.draft.distinctQuestions} / ${res.draft.poolQuestions}`} hint={t("saved_prefix", { v: res.saved.distinctQuestions })} />
            <Fact label={t("fact_gap")} value={res.draft.meanRepeatGapDays === null ? t("none") : fmt(res.draft.meanRepeatGapDays, 1)} hint={res.saved.meanRepeatGapDays === null ? t("saved_none") : t("saved_prefix", { v: fmt(res.saved.meanRepeatGapDays, 1) })} />
            <Fact label={t("fact_need_share")} value={pct(res.draft.reasonMix.need, 1)} hint={t("saved_prefix", { v: pct(res.saved.reasonMix.need, 1) })} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t("served_domains")}>
              <div className="space-y-3">
                {res.draft.domainMix.map((d, i) => <MixRow key={d.domainId} label={domainLabel(d.name, lang)} draft={d.share} saved={res.saved.domainMix[i]!.share} max={maxDomain} />)}
              </div>
            </Card>
            <Card title={t("formats_reasons")}>
              <div className="space-y-3">
                {types.map((ty) => <MixRow key={ty} label={t(FORMAT_KEYS[ty])} draft={shareOf(res.draft, ty)} saved={shareOf(res.saved, ty)} max={1} />)}
                <hr className="border-line" />
                {reasons.map((r) => <MixRow key={r} label={t(REASON_KEYS[r]!)} draft={res.draft.reasonMix[r]} saved={res.saved.reasonMix[r]} max={1} />)}
              </div>
            </Card>
          </div>

          {res.draft.needCoverage.length > 0 && (
            <Card title={t("need_cov_title")} meta={t("need_cov_meta")}>
              <div className="space-y-3">
                {res.draft.needCoverage.map((n) => (
                  <div key={n.questionId} className="text-[13px]">
                    <p className="mb-1 truncate">{n.text}</p>
                    <div className="flex items-end gap-0.5" style={{ height: 36 }} role="img" aria-label={t("coverage_aria", { pct: pct(n.byDay.at(-1) ?? 0) })}>
                      {n.byDay.map((v, i) => <div key={i} className="min-w-0 flex-1 rounded-t-sm" title={t("day_n", { n: i + 1, pct: pct(v) })} style={{ height: `${Math.max(3, v * 100)}%`, background: "var(--accent)" }} />)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title={t("queue_title")} meta={t("queue_meta", { who: `${collectiveLabel(c.name, lang)}${tornId ? ` · ${shiftLabel(brain.shifts.find((s) => s.id === tornId)?.name ?? "", lang)}` : ""}` })}>
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {res.draft.queue.map((q) => (
                <li key={q.day} className="rounded-lg border border-line px-3 py-2">
                  <p className="text-xs font-semibold text-subtle">{dayName(q.day)}</p>
                  <ul className="mt-1 space-y-1">
                    {q.items.map((it) => (
                      <li key={it.questionId} className="text-[13px]">
                        <span className="badge mr-1">{t(REASON_KEYS[it.reason]!)}</span>
                        <span className="text-subtle">{domainLabel(brain.domains.find((d) => d.id === it.domainId)?.name ?? "", lang)} · {t(FORMAT_KEYS[it.type])}</span>
                        <span className="block">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={t("top_title")}>
            <ol className="space-y-2 text-[13px]">
              {res.draft.topQuestions.map((q) => (
                <li key={q.questionId} className="grid grid-cols-[1fr_5rem] items-center gap-3 sm:grid-cols-[1fr_12rem_5rem]">
                  <span className="truncate" title={q.text}>{q.text}</span>
                  <span className="hidden sm:block"><Bar value={q.share} max={res.draft.topQuestions[0]!.share} /></span>
                  <span className="num text-right">{pct(q.share, 1)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
