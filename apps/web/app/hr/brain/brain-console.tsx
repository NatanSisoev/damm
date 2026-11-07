"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { QuestionType } from "@damm/shared";
import type { Brain, BrainCollective, SimResult } from "@/lib/hr-engine";
import { Card, Empty, SuppressedBadge } from "../ui";
import { recomputeAction } from "../actions";
import { refreshBrainAction, resetConfigAction, saveConfigAction, saveWeightsAction, simulateAction } from "./actions";
import { CLOSED_TYPES, FORMAT_LABELS, PARAM_GROUPS, REASON_LABELS, WEIGHT_SOURCE_LABELS, type ParamMeta } from "./meta";

type Tab = "summary" | "params" | "weights" | "sim";
const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Estat" },
  { key: "params", label: "Paràmetres" },
  { key: "weights", label: "Pesos" },
  { key: "sim", label: "Simulador i cua" },
];

const nf = (d: number) => new Intl.NumberFormat("ca-ES", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const fmt = (v: number, d = 2) => nf(d).format(v);
const pct = (v: number, d = 0) => `${nf(d).format(v * 100)} %`;

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

function Slider({ meta, value, saved, onChange }: { meta: ParamMeta; value: number; saved: number; onChange: (v: number) => void }) {
  const changed = value !== saved;
  const id = `p-${meta.key}`;
  return (
    <div className={`rounded-lg border px-4 py-3 ${changed ? "border-line-strong bg-accent-soft" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[14px] font-semibold">{meta.label}</label>
        <span className="flex items-center gap-2">
          {changed && <span className="badge" title={`Desat: ${fmt(saved, 4)}`}>Canviat</span>}
          <input
            type="number" className="input num w-28 text-right" min={meta.min} max={meta.max} step={meta.step} value={value}
            aria-label={`${meta.label}, valor`}
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
      apply(r, `${changedKeys.length === 1 ? "S'ha desat 1 paràmetre" : `S'han desat ${changedKeys.length} paràmetres`}. Els lots d'avui ja generats no canvien; el canvi s'aplica als de demà.`);
    });

  const resetConfig = (keys?: string[]) =>
    startBusy(async () => {
      const r = await resetConfigAction(keys);
      if (r.ok) syncDraft(r.brain);
      apply(r, keys ? "Paràmetre restaurat al valor per defecte." : "Tots els paràmetres tornen als valors per defecte.");
    });

  const saveWeights = () =>
    startBusy(async () => {
      if (!collective) return;
      const r = await saveWeightsAction(collective.id, draftWeights.domains, draftWeights.formats);
      apply(r, `Pesos de ${collective.name} desats.`, () => setWeightDrafts((w) => ({ ...w, [collective.id]: { domains: {}, formats: {} } })));
    });

  const clearWeight = (kind: "domain" | "format", key: number | QuestionType) =>
    startBusy(async () => {
      if (!collective) return;
      const r = kind === "domain" ? await saveWeightsAction(collective.id, { [key as number]: null }, {}) : await saveWeightsAction(collective.id, {}, { [key as QuestionType]: null });
      apply(r, "El valor torna al general.", () =>
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
      apply(r, "L'anàlisi s'ha tornat a calcular.");
    });

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted">
          <span>Motor <strong className="num text-ink">v{brain.version}</strong></span>
          <span>Avui <strong className="num text-ink">{brain.day}</strong> ({brain.timezone})</span>
          <span>Última anàlisi <strong className="num text-ink">{brain.lastJobAt ?? "cap"}</strong></span>
          <span>Mínim de grup <strong className="num text-ink">{brain.minGroupSize}</strong> <span className="text-subtle">(fix, no es pot canviar)</span></span>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="coll" className="text-subtle">Col·lectiu</label>
          <select id="coll" className="input" value={collective?.id} onChange={(e) => setCollectiuId(Number(e.target.value))}>
            {brain.collectives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="btn btn-ghost" onClick={recompute} disabled={busy}>Recalcula l&apos;anàlisi</button>
        </div>
      </div>

      <div role="tablist" aria-label="Seccions del cervell" className="flex flex-wrap gap-2 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
          >
            {t.label}
            {t.key === "params" && changedKeys.length > 0 && <span className="badge ml-2">{changedKeys.length}</span>}
            {t.key === "weights" && changedWeights > 0 && <span className="badge ml-2">{changedWeights}</span>}
          </button>
        ))}
      </div>

      {dirty && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-line-strong px-5 py-3 text-[13px]" role="status">
          <span>Tens canvis sense desar. El simulador ja els fa servir; els empleats encara no.</span>
          <button type="button" className="btn btn-ghost" onClick={discard}>Descarta els canvis</button>
        </div>
      )}
      {msg && (
        <p role={msg.tone === "err" ? "alert" : "status"} className={`text-[13px] ${msg.tone === "err" ? "text-[var(--warn)]" : "text-[var(--good)]"}`}>{msg.text}</p>
      )}

      {tab === "summary" && collective && <Summary brain={brain} c={collective} />}

      {tab === "params" && (
        <div className="space-y-6">
          {PARAM_GROUPS.map((g) => (
            <Card key={g.id} title={g.title} meta={g.intro}>
              <div className="grid gap-3 lg:grid-cols-2">
                {g.params.map((p) => (
                  <div key={p.key} className="space-y-1">
                    <Slider
                      meta={p} value={Number(configDraft[p.key])} saved={Number(savedConfig[p.key])}
                      onChange={(v) => setConfigDraft((d) => ({ ...d, [p.key]: v }))}
                    />
                    {brain.config.find((c) => c.key === p.key)?.overridden && (
                      <button type="button" className="text-xs text-subtle underline" onClick={() => resetConfig([p.key])} disabled={busy}>
                        Torna al valor per defecte ({fmt(Number(brain.config.find((c) => c.key === p.key)!.default), 4)})
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <Card title="Soroll per format" meta="Quanta variació s'espera en una resposta segons el tipus de pregunta. Més soroll, cada resposta pesa menys.">
            <div className="grid gap-3 lg:grid-cols-2">
              {CLOSED_TYPES.map((t) => {
                const cur = configDraft.noise_sd as Record<string, number>;
                const sv = savedConfig.noise_sd as Record<string, number>;
                return (
                  <Slider
                    key={t} meta={{ key: `noise_${t}`, label: FORMAT_LABELS[t], hint: "Desviació estàndard sobre l'escala 0 a 1.", min: 0.02, max: 0.5, step: 0.01 }}
                    value={cur[t]!} saved={sv[t]!} onChange={(v) => setConfigDraft((d) => ({ ...d, noise_sd: { ...(d.noise_sd as object), [t]: v } }))}
                  />
                );
              })}
            </div>
          </Card>
          <Card title="Creences inicials" meta="El que el motor suposa abans de tenir dades.">
            <div className="grid gap-3 lg:grid-cols-2">
              <Slider
                meta={{ key: "prior_level", label: "Nivell inicial esperat", hint: "Puntuació de partida d'una persona sense respostes, de 0 a 1.", min: 0, max: 1, step: 0.01 }}
                value={(configDraft.priors as { level: number }).level} saved={(savedConfig.priors as { level: number }).level}
                onChange={(v) => setConfigDraft((d) => ({ ...d, priors: { ...(d.priors as object), level: v } }))}
              />
              <Slider
                meta={{ key: "prior_variance", label: "Incertesa inicial", hint: "Variància de partida. Més alta, les primeres respostes pesen més.", min: 0.005, max: 0.25, step: 0.005 }}
                value={(configDraft.priors as { variance: number }).variance} saved={(savedConfig.priors as { variance: number }).variance}
                onChange={(v) => setConfigDraft((d) => ({ ...d, priors: { ...(d.priors as object), variance: v } }))}
              />
            </div>
          </Card>
          <Card title="Formats que poden obrir un seguiment" meta="Només els formats prou precisos haurien de disparar-lo.">
            <div className="flex flex-wrap gap-4">
              {CLOSED_TYPES.map((t) => {
                const list = configDraft.followup_trigger_types as string[];
                return (
                  <label key={t} className="flex items-center gap-2 text-[14px]">
                    <input
                      type="checkbox" checked={list.includes(t)}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, followup_trigger_types: e.target.checked ? [...list, t] : list.filter((x) => x !== t) }))}
                    />
                    {FORMAT_LABELS[t]}
                  </label>
                );
              })}
            </div>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={saveConfig} disabled={busy || changedKeys.length === 0}>
              Desa els paràmetres{changedKeys.length ? ` (${changedKeys.length})` : ""}
            </button>
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={!dirty}>Descarta els canvis</button>
            <button
              type="button" className="btn btn-ghost" disabled={busy || !brain.config.some((c) => c.overridden)}
              onClick={() => confirm("Tots els paràmetres tornaran als valors per defecte. Els pesos per àmbit i format no es toquen.") && resetConfig()}
            >
              Restaura tots els valors per defecte
            </button>
          </div>
        </div>
      )}

      {tab === "weights" && collective && (
        <div className="space-y-6">
          <Card title={`Pesos de ${collective.name}`} meta="Quant interessa cada àmbit i cada format en aquest col·lectiu. El motor ja n'ajusta la prioritat amb les dades.">
            <div className="space-y-3">
              {brain.domains.map((d) => {
                const dom = collective.domains.find((x) => x.domainId === d.id)!;
                return (
                  <div key={d.id} className="space-y-1">
                    <Slider
                      meta={{ key: `w_${d.id}`, label: d.name, hint: `Ara: ${WEIGHT_SOURCE_LABELS[dom.weightSource]}. Sempre més gran que 0: cap àmbit queda sense mirar.`, min: 0.1, max: 5, step: 0.1 }}
                      value={weightOf(d.id)} saved={dom.weight}
                      onChange={(v) => setWeightDrafts((w) => ({ ...w, [collective.id]: { ...draftWeights, domains: { ...draftWeights.domains, [d.id]: v } } }))}
                    />
                    {dom.weightSource === "collective" && (
                      <button type="button" className="text-xs text-subtle underline" onClick={() => clearWeight("domain", d.id)} disabled={busy}>Treu el valor propi</button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Formats" meta="0 vol dir que aquest format no es mostra mai a aquest col·lectiu.">
            <div className="grid gap-3 lg:grid-cols-2">
              {(Object.keys(FORMAT_LABELS) as QuestionType[]).map((t) => {
                const f = collective.formats.find((x) => x.type === t)!;
                return (
                  <div key={t} className="space-y-1">
                    <Slider
                      meta={{ key: `f_${t}`, label: `${FORMAT_LABELS[t]} · ${f.questions} preguntes`, hint: `Ara: ${WEIGHT_SOURCE_LABELS[f.preferenceSource]}.`, min: 0, max: 3, step: 0.1 }}
                      value={prefOf(t)} saved={f.preference}
                      onChange={(v) => setWeightDrafts((w) => ({ ...w, [collective.id]: { ...draftWeights, formats: { ...draftWeights.formats, [t]: v } } }))}
                    />
                    {f.preferenceSource === "collective" && (
                      <button type="button" className="text-xs text-subtle underline" onClick={() => clearWeight("format", t)} disabled={busy}>Treu el valor propi</button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="flex gap-3">
            <button type="button" className="btn btn-primary" onClick={saveWeights} disabled={busy || changedWeights === 0}>Desa els pesos de {collective.name}</button>
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={!dirty}>Descarta els canvis</button>
          </div>
        </div>
      )}

      {tab === "sim" && collective && (
        <Simulator
          brain={brain} c={collective} changedKeys={changedKeys} configDraft={configDraft}
          weights={{ domains: Object.fromEntries(brain.domains.map((d) => [d.id, weightOf(d.id)])), formats: Object.fromEntries((Object.keys(FORMAT_LABELS) as QuestionType[]).map((t) => [t, prefOf(t)])) }}
        />
      )}
    </div>
  );
}

// --- Estat -----------------------------------------------------------------------------------

function Summary({ brain, c }: { brain: Brain; c: BrainCollective }) {
  const maxShare = Math.max(0.01, ...c.domains.map((d) => d.drawShare));
  const maxGain = Math.max(1e-9, ...c.domains.map((d) => d.stats?.infoGain ?? 0));
  return (
    <div className="space-y-6">

      <Card title="Com es reparteix l'atenció" meta="Prioritat = pes × impuls × (guany d'informació + mínim) × (1 + impuls per canvis bruscos)">
        {c.suppressed && <p className="mb-3 text-[13px] text-subtle">Aquest col·lectiu té menys de {brain.minGroupSize} comptes, així que les estadístiques queden amagades i el motor reparteix l&apos;atenció només amb els pesos.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Àmbit</th>
                <th className="py-2 pr-3 font-medium">Puntuació</th>
                <th className="py-2 pr-3 font-medium">Confiança</th>
                <th className="py-2 pr-3 font-medium">Consens</th>
                <th className="py-2 pr-3 font-medium">Guany d&apos;informació</th>
                <th className="py-2 pr-3 font-medium">Canvis bruscos</th>
                <th className="py-2 pr-3 font-medium">Pes</th>
                <th className="py-2 pr-3 font-medium">Probabilitat de sortir primer</th>
              </tr>
            </thead>
            <tbody>
              {c.domains.map((d) => (
                <tr key={d.domainId} className="border-t border-line align-middle">
                  <td className="py-2 pr-3 font-medium">{d.name}<span className="block text-xs font-normal text-subtle">{d.questions} preguntes</span></td>
                  <td className="num py-2 pr-3">{d.stats ? fmt(d.stats.score, 1) : <SuppressedBadge />}</td>
                  <td className="num py-2 pr-3">{d.stats ? `${fmt(d.stats.confidence, 0)} %` : "—"}</td>
                  <td className="num py-2 pr-3">{d.stats ? `${fmt(d.stats.consensus, 0)} %` : "—"}</td>
                  <td className="py-2 pr-3 w-36">{d.stats ? <Bar value={d.stats.infoGain} max={maxGain} /> : "—"}</td>
                  <td className="num py-2 pr-3">{d.stats ? (d.stats.recent ? pct(d.stats.outlierShare, 1) : "—") : "—"}</td>
                  <td className="num py-2 pr-3">
                    {fmt(d.weight, 1)}
                    {d.probeBoost > 1 && <span className="badge badge-accent ml-1" title="Indagar actiu">×{fmt(d.probeBoost, 1)}</span>}
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
          El guany d&apos;informació és quant baixaria l&apos;error amb una resposta més. Els canvis bruscos són la part de respostes recents que s&apos;han allunyat de la línia habitual de cada persona.
          Una fila només es mostra amb {brain.minGroupSize} comptes o més.
        </p>
      </Card>

      <Card title="Formats" meta="El motor prova formats i es queda amb els que la gent respon amb atenció (mostreig de Thompson). La preferència de l'equip de persones hi pesa.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Format</th>
                <th className="py-2 pr-3 font-medium">Preguntes</th>
                <th className="py-2 pr-3 font-medium">Preferència</th>
                <th className="py-2 pr-3 font-medium">Respostes atentes, per torn</th>
              </tr>
            </thead>
            <tbody>
              {c.formats.map((f) => (
                <tr key={f.type} className="border-t border-line align-middle">
                  <td className="py-2 pr-3 font-medium">{FORMAT_LABELS[f.type]}</td>
                  <td className="num py-2 pr-3">{f.questions}</td>
                  <td className="num py-2 pr-3">{f.preference === 0 ? <span className="badge badge-warn">Prohibit</span> : fmt(f.preference, 1)}</td>
                  <td className="py-2 pr-3">
                    {f.arms.length === 0 ? <span className="text-subtle">Encara sense dades</span> : (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {f.arms.map((a) => (
                          <span key={a.tornId} className="num">
                            {a.shift}: <strong>{c.suppressed ? "—" : pct(a.mean)}</strong>
                            <span className="text-xs text-subtle"> ({a.observations} obs.)</span>
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

      <Card title="Indagar actius" meta="Mostreig addicional que l'equip de persones ha demanat.">
        {brain.probes.length === 0 ? <Empty>Cap Indagar actiu.</Empty> : (
          <ul className="space-y-1 text-[13px]">
            {brain.probes.map((p) => (
              <li key={p.id}><strong>{p.collective}</strong>{p.shift ? ` · ${p.shift}` : ""} · {p.domain} · ×{fmt(p.boost, 1)} fins al <span className="num">{p.endsAt.slice(0, 10)}</span></li>
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
      <div className="text-xs font-medium text-subtle">{label}</div>
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
  const types = res ? [...new Set([...res.draft.typeMix, ...res.saved.typeMix].map((t) => t.type))] : [];
  const shareOf = (r: SimResult, t: QuestionType) => r.typeMix.find((x) => x.type === t)?.share ?? 0;
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("ca-ES", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="space-y-6">
      <Card title="Prova-ho" meta="Persones imaginàries sense historial, amb el banc de preguntes real. Res no es desa i cap compte es llegeix.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="sim-days">Dies</label>
            <input id="sim-days" type="number" className="input num w-full" min={1} max={28} value={days} onChange={(e) => setDays(Math.max(1, Math.min(28, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label className="label" htmlFor="sim-people">Persones</label>
            <input id="sim-people" type="number" className="input num w-full" min={1} max={300} value={people} onChange={(e) => setPeople(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label className="label" htmlFor="sim-shift">Torn</label>
            <select id="sim-shift" className="input w-full" value={tornId ?? ""} onChange={(e) => setTornId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sense torn</option>
              {brain.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sim-probe">Indagar (prova)</label>
            <div className="flex gap-2">
              <select id="sim-probe" className="input min-w-0 flex-1" value={probe?.domainId ?? ""} onChange={(e) => setProbe(e.target.value ? { domainId: Number(e.target.value), boost: probe?.boost ?? 3 } : null)}>
                <option value="">Cap</option>
                {brain.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {probe && <input type="number" aria-label="Multiplicador" className="input num w-16" min={1.5} max={10} step={0.5} value={probe.boost} onChange={(e) => setProbe({ ...probe, boost: Number(e.target.value) || 2 })} />}
            </div>
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn-ghost w-full" onClick={() => setSeed(Math.random().toString(36).slice(2, 7))}>Barreja la sort</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-subtle" aria-live="polite">
          {doneKey !== key && "Calculant… "}Barres fosques: amb els canvis sense desar. Barres clares: el que hi ha desat ara.
          {res?.draft.neutralSignals && ` Aquest col·lectiu té menys de ${brain.minGroupSize} comptes: el simulador fa servir senyals neutres.`}
        </p>
        {error && <p role="alert" className="mt-2 text-[13px] text-[var(--warn)]">{error}</p>}
      </Card>

      {res && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Preguntes per persona i dia" value={fmt(res.draft.slotsPerDay, 2)} hint={`desat: ${fmt(res.saved.slotsPerDay, 2)}`} />
            <Fact label="Preguntes diferents servides" value={`${res.draft.distinctQuestions} / ${res.draft.poolQuestions}`} hint={`desat: ${res.saved.distinctQuestions}`} />
            <Fact label="Dies entre repeticions" value={res.draft.meanRepeatGapDays === null ? "cap" : fmt(res.draft.meanRepeatGapDays, 1)} hint={res.saved.meanRepeatGapDays === null ? "desat: cap" : `desat: ${fmt(res.saved.meanRepeatGapDays, 1)}`} />
            <Fact label="Part de necessitats" value={pct(res.draft.reasonMix.need, 1)} hint={`desat: ${pct(res.saved.reasonMix.need, 1)}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Àmbits servits">
              <div className="space-y-3">
                {res.draft.domainMix.map((d, i) => <MixRow key={d.domainId} label={d.name} draft={d.share} saved={res.saved.domainMix[i]!.share} max={maxDomain} />)}
              </div>
            </Card>
            <Card title="Formats i motius">
              <div className="space-y-3">
                {types.map((t) => <MixRow key={t} label={FORMAT_LABELS[t]} draft={shareOf(res.draft, t)} saved={shareOf(res.saved, t)} max={1} />)}
                <hr className="border-line" />
                {reasons.map((r) => <MixRow key={r} label={REASON_LABELS[r]} draft={res.draft.reasonMix[r]} saved={res.saved.reasonMix[r]} max={1} />)}
              </div>
            </Card>
          </div>

          {res.draft.needCoverage.length > 0 && (
            <Card title="Quan arriba cada necessitat publicada" meta="Part de les persones que ja l'han vista al final de cada dia.">
              <div className="space-y-3">
                {res.draft.needCoverage.map((n) => (
                  <div key={n.questionId} className="text-[13px]">
                    <p className="mb-1 truncate">{n.text}</p>
                    <div className="flex items-end gap-0.5" style={{ height: 36 }} role="img" aria-label={`Cobertura: ${pct(n.byDay.at(-1) ?? 0)} al final`}>
                      {n.byDay.map((v, i) => <div key={i} className="min-w-0 flex-1 rounded-t-sm" title={`Dia ${i + 1}: ${pct(v)}`} style={{ height: `${Math.max(3, v * 100)}%`, background: "var(--accent)" }} />)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Cua d'una persona imaginària" meta={`${c.name}${tornId ? ` · ${brain.shifts.find((s) => s.id === tornId)?.name}` : ""}. Això és el que rebria dia a dia amb aquests paràmetres.`}>
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {res.draft.queue.map((q) => (
                <li key={q.day} className="rounded-lg border border-line px-3 py-2">
                  <p className="text-xs font-semibold text-subtle">{dayName(q.day)}</p>
                  <ul className="mt-1 space-y-1">
                    {q.items.map((it) => (
                      <li key={it.questionId} className="text-[13px]">
                        <span className="badge mr-1">{REASON_LABELS[it.reason]}</span>
                        <span className="text-subtle">{brain.domains.find((d) => d.id === it.domainId)?.name} · {FORMAT_LABELS[it.type]}</span>
                        <span className="block">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Preguntes que més surten">
            <ol className="space-y-2 text-[13px]">
              {res.draft.topQuestions.map((t) => (
                <li key={t.questionId} className="grid grid-cols-[1fr_5rem] items-center gap-3 sm:grid-cols-[1fr_12rem_5rem]">
                  <span className="truncate" title={t.text}>{t.text}</span>
                  <span className="hidden sm:block"><Bar value={t.share} max={res.draft.topQuestions[0]!.share} /></span>
                  <span className="num text-right">{pct(t.share, 1)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
}
