# Engine simulator and tuning harness

Offline tuning for `docs/engine.md` section 11: run the real engine on a synthetic world whose truth is known, measure how close its outputs are, and search the hyperparameters. Synthetic data only.

| File | What |
|---|---|
| `world.ts` | seeded world: population, accounts, question pool, latent truth per person × domain × day, planted signals |
| `run.ts` | drives `createEngine` + `submitAnswers` day by day on in-memory `node:sqlite`, runs `runEngineJob` at checkpoints, reports metrics |
| `tune.ts` | random search over the hyperparameters, writes `results/best-config.json` and `results/validation.txt` |

```bash
pnpm --filter @damm/engine run sim                      # default world, default config, ~50 s
pnpm --filter @damm/engine run sim -- --config=sim/results/best-config.json
pnpm --filter @damm/engine run sim -- --seed=x --scale=0.4 --every=4 --json
pnpm --filter @damm/engine run tune -- --trials=24 --workers=5   # ~10 min
```

## World

- 1,200 synthetic employees in 4 collectives: Fàbriques and Logística with 3 shifts, Comercial and Oficines without. Each stratum has its own participation rate (night shifts low, Logística night below the minimum group size). `--scale` multiplies all rates; the default run uses 0.4 (about 140 accounts) to stay under a minute.
- Everyone with an account answers every question of every daily batch (current assumption).
- Truth per person and domain: collective base + person trait + domain offset + a slow random walk, plus planted signals, clamped to 0..1.
- Question pool: per domain 3 facets × 2 wordings in different types (scale10, scale5 reversed, yes_no, pair, choice, scale10 reversed) plus a follow-up wording. Each item has a wording bias (sd 0.07, centred per domain).
- Answers: truth + item bias + manager bias + noise, then mapped to the format (rounded scale, Bernoulli yes/no, nearest option).

Planted signals:

| Signal | Where | Shape |
|---|---|---|
| weak signal | Logística × Condicions | linear decline of 0.12 from 2026-08-15 to the end |
| October theme | Fàbriques × Condicions (shift communication) | step of −0.12 from 2026-10-01 over 3 days |
| manager positivity bias | managers (8 %) | +0.08 on answers, not on truth |
| sharp personal drops | 8 accounts × Lideratge | −0.35 on a random day between 25 Aug and 15 Oct |

## Metrics

- **Score error:** `agregat.score` (final job, all periods, all non-suppressed segments) minus 10 × the true population mean at the period's reference time.
- **Confidence calibration:** at every checkpoint, does the truth fall within ±`se_tolerance` of the score? Compared with the coverage the reported SE implies (SE recovered from `confidence = 100 (1 − SE / se_tolerance)`, normal model). `z rms` = rms of error / SE; 1 means the SE is honest, above 1 overconfident.
- **Signal delay:** days from onset until the collective's score is at least 2 combined SEs below its last pre-onset checkpoint. The same rule on all unplanted collective × domain pairs gives the false-drop count.
- **Follow-ups:** confirmed Lideratge drops (`person_domain_state.confirmed_change_*`, logged daily) vs the planted personal drops. A confirmation is a true positive if it is for a planted account within 30 days of its onset.
- **Question share** per domain, type and reason, from `assignment`.
- **Answer noise:** realised sd of the score around truth + item bias, per type, next to the engine's `noise_sd`.

## Tuning loss

`RMSE + 0.5·|ln z_rms| + mean signal delay / 100 days + (1 − follow-up F1) + 0.5·false-drop rate`. Stage 1 searches on seed `tune-1` (scale 0.3), stage 2 re-scores the top 3 and the defaults on `tune-2`, stage 3 compares default and best on the held-out seed `damm-sim` at the default scale.

`best-config.json` has the winning values both as `config` (camelCase, for `createEngine({ config })` and `--config`) and as `engineConfigKeys` (snake_case, for `setConfig` / `engine_config`).
