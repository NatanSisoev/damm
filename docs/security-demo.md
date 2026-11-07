# Security and anonymity demo (2 minutes)

Goal: show the judges that anonymity is enforced by the code and the database, not by good intentions. Five proofs, about 25 seconds each.

All output below was produced by running the commands on this branch against synthetic data. Account ids, salts and hashes change on every seed, so yours will differ in the hex strings; everything else is the same.

## Setup (before going on stage)

```bash
pnpm install
pnpm --filter @damm/db run init
pnpm --filter @damm/seed run seed
```

That gives `data/app.db` with about 170 synthetic accounts and the seeded responses (used by steps d and e).

Until the analysis job exists, the seed writes raw data only, so the aggregate tables (`agregat`, `tema`) are empty and `/hr/results` would be blank. Step (c) therefore runs the HR app on a second database made by `init` alone, which loads the aggregate fixtures, including the n<10 group:

```bash
DB_PATH="$PWD/data/results-fixtures.db" pnpm --filter @damm/db run init
cd apps/web && DB_PATH="$PWD/../../data/results-fixtures.db" pnpm exec next dev -p 3217
```

Leave that dev server running in a second terminal tab. When the analysis job lands, `data/app.db` will be enough and this extra database can go.

## 1. The compiler stops a forbidden import (a), 25 s

Say: "HR code can only talk to the database through one door, `@damm/db/hr`, which exposes aggregates. If a developer tries to import anything else, lint fails."

Command (plants a temporary file in HR code, shows the failure, deletes it):

```bash
bash scripts/security-demo.sh
```

For a live walkthrough with a pause between steps, run `DEMO_PAUSE=1 bash scripts/security-demo.sh`.

Point at the planted file the script prints:

```
// TEMPORARY demo file, deleted automatically by scripts/security-demo.sh.
import { getDb } from "@damm/db";

export const leak = () => getDb().prepare("SELECT compte_id, valor_num FROM resposta").all();
```

Expected ESLint output (exit code 1):

```
apps/web/app/hr/zz-planted-violation.ts
  2:1  error  '@damm/db' import is restricted from being used. Anonymity boundary: HR code must not import the @damm/db root (it exposes getDb and raw tables). Use @damm/db/hr  no-restricted-imports

✖ 1 problem (1 error, 0 warnings)
```

Where the rule lives: `apps/web/eslint.config.mjs`, block "Anonymity boundary". It forbids `@damm/db`, `better-sqlite3`, `node:sqlite` and every `@damm/db/*` except `@damm/db/hr` under `app/hr/**`.

To run only the lint step by hand, create any file under `apps/web/app/hr/` that imports `@damm/db`, then `cd apps/web && pnpm exec eslint app/hr/<file>.ts`, and delete it afterwards. The script does this for you.

## 2. A second guard catches it, and passes on the clean tree (b), 25 s

Say: "Lint can be skipped. So there is a second check, built for CI, that also reads the data layer and the SQL view."

The same script runs `pnpm check:anonymity` three times. On the clean tree (exit code 0):

```
Anonymity check passed: 3 HR data file(s), HR app imports and v_resposta_analitica are clean.
```

With the planted file (exit code 1):

```
Anonymity boundary violated (3):

  ✗ apps/web/app/hr/zz-planted-violation.ts:2
    forbidden import "@damm/db": the @damm/db root exposes getDb and raw tables.

  ✗ apps/web/app/hr/zz-planted-violation.ts:2
    HR code references getDb: it must not touch the database handle.

  ✗ apps/web/app/hr/zz-planted-violation.ts:4
    HR code references getDb: it must not touch the database handle.

See AGENTS.md, section "Anonymity boundary".
 ELIFECYCLE  Command failed with exit code 1.
```

After cleanup the script prints that the planted file is gone and `git status` is unchanged, then runs the check once more and it passes again. A `trap` removes the file even if you press Ctrl-C.

What the check covers (`scripts/check-anonymity.mjs`):
- the HR data layer (`packages/db/src/hr.ts` and everything it imports) may not mention `resposta`, `compte_id`, `password_hash`, `salt`, `username`, `push_subscripcio` and so on, with one whitelisted function that only counts accounts per collective;
- nothing under `apps/web/app/hr/**` may import the DB root, raw repositories or a driver;
- the view `v_resposta_analitica` may not expose `compte_id`.

## 3. Groups under 10 show as "Suprimit" (c), 30 s

Say: "Minimum group size is 10. Below that, the number is not hidden by the UI, it never leaves the repository."

With the step 1 dev server running, open `http://localhost:3217/hr/results`. Scroll to the cards "Temes dels comentaris", "Representativitat" and "Tendències per domini". Point at:
- the top note: "Els segments amb menys de 10 respondents es mostren com a Suprimit";
- the row `Logística · nit` showing a "Suprimit" badge and "Menys de 10 respondents" instead of a percentage and an n;
- in the trends table, `Desenvolupament` for Logística in Aug 2026 shows "Suprimit" instead of a number;
- the theme "Càrrega de feina a final de mes" with 28 comments is shown, while a theme under 10 comments appears as "Suprimit / Menys de 10 comentaris: tema ocult".

Page text captured from the running page:

```
Logística · nit Suprimit Menys de 10 respondents
```

Now the same in the export, the other way data could leave the system. Download `http://localhost:3217/hr/results/export` (button "Exporta CSV") or run:

```bash
curl -s http://localhost:3217/hr/results/export | grep -E 'tipus,|,1$'
```

Output (the header, then the two suppressed rows; the 6 respondents of Logística/nit are blank):

```
tipus,periode,collectiu,torn,domini,respondents,resp_pct,pop_pct,diferencia_pp,mitjana,suprimit
representativitat_torn,2026-10,Logística,nit,,,,,,,1
tendencia,2026-08,Logística,,Desenvolupament,,,,,,1
```

For contrast, the raw fixture row in the database does hold the small number. This is the number the repository refuses to hand out:

```bash
sqlite3 -header -column data/results-fixtures.db "SELECT a.periode, c.nom AS collectiu, t.nom AS torn, a.n, a.mitjana, a.suprimit FROM agregat a JOIN collectiu c ON c.id=a.collectiu_id LEFT JOIN torn t ON t.id=a.torn_id WHERE a.suprimit=1;"
```

```
periode  collectiu  torn  n  mitjana  suprimit
-------  ---------  ----  -  -------  --------
2026-10  Logística  nit   6           1
2026-08  Logística        7           1
```

Code: `MIN_GROUP_SIZE = 10` in `packages/shared/src/index.ts`; the checks `r.n < MIN_GROUP_SIZE || !!r.suprimit` in `packages/db/src/hr-repository.ts`, used by both the page and `exportResultsCsv()`. Shares are computed among visible segments only, so a hidden count cannot be recovered by subtraction.

## 4. The analytics view has no `compte_id` (d), 20 s

Say: "Analysis and the dashboard read answers through this view. It joins the account to get the collective and shift, but the account id is not in the output."

```bash
sqlite3 -header -column data/app.db "PRAGMA table_info(v_resposta_analitica);"
```

```
cid  name             type     notnull  dflt_value  pk
---  ---------------  -------  -------  ----------  --
0    id               INTEGER  0                    0
1    pregunta_id      INTEGER  0                    0
2    domini_id        INTEGER  0                    0
3    collectiu_id     INTEGER  0                    0
4    centre_tipus_id  INTEGER  0                    0
5    torn_id          INTEGER  0                    0
6    es_manager       INTEGER  0                    0
7    valor_num        REAL     0                    0
8    comentari        TEXT     0                    0
9    periode          TEXT     0                    0
10   data             TEXT     0                    0
```

One-line proof that can be read from the back of the room:

```bash
sqlite3 data/app.db "SELECT count(*) FROM pragma_table_info('v_resposta_analitica') WHERE name='compte_id';"
```

```
0
```

Show the definition too:

```bash
sqlite3 data/app.db "SELECT sql FROM sqlite_master WHERE name='v_resposta_analitica';"
```

```
CREATE VIEW v_resposta_analitica AS
SELECT r.id, r.pregunta_id, p.domini_id, c.collectiu_id, c.centre_tipus_id, c.torn_id,
       c.es_manager, r.valor_num, r.comentari, r.periode, r.data
FROM resposta r
JOIN compte c   ON c.id = r.compte_id
JOIN pregunta p ON p.id = r.pregunta_id
```

A sample row (an answer, its question, its group, a redacted comment, no person):

```bash
sqlite3 data/app.db "SELECT * FROM v_resposta_analitica LIMIT 2;"
```

```
1|3|1|1|1|1|0|10.0||2026-08|2026-08-01 10:14:38
2|66|2|3|4||0|5.0|Últimament es parla de canvis però no se sap què implicaran. Seria bo millorar-ho.|2026-08|2026-08-01 12:28:28
```

The view is defined in `packages/db/schema.sql`. Step (b) fails the build if someone adds `compte_id` or a `*` to it.

## 5. Credentials are salted hashes, recovery codes too (e), 30 s

Say: "There is no email, no phone, no name. An account is a random id, a username, and salted hashes. Not even we can read the password or the recovery code."

The schema says it (`packages/db/schema.sql`): `compte` has `username`, `password_hash`, `salt`, `recovery_hash`, and nothing personal.

The seeded accounts use a deliberately fake hash, so to show the real scrypt hashes and a real recovery code, register one account through the real onboarding code on a scratch copy of the database. Never point this at `data/app.db`.

```bash
cp data/app.db /tmp/demo-copy.db
cd packages/db && DB_PATH=/tmp/demo-copy.db pnpm exec tsx ../../scripts/security-demo-account.mts; cd ../..
```

```
Account created. Recovery code shown ONCE to the user: PU9A-23EY-WGBW-ZE92
```

The code is random on every run. Now look at what is stored:

```bash
sqlite3 -header -column /tmp/demo-copy.db "SELECT id, username, substr(salt,1,16)||'…' AS salt, substr(password_hash,1,24)||'…' AS password_hash, length(password_hash) AS hash_len, substr(recovery_hash,1,24)||'…' AS recovery_hash FROM compte WHERE username='demo_jutge';"
```

```
id                                    username    salt               password_hash              hash_len  recovery_hash
------------------------------------  ----------  -----------------  -------------------------  --------  -------------------------
9825fdb9-afa9-4c1c-80fb-c91c6159c0cb  demo_jutge  2e87e3001b77f168…  5615a76cacd6680ca3d3319b…  128       d530f9757286b0520469d6ec…
```

Point at: the id is a random UUID, the salt is unique per account, `password_hash` is 128 hex characters (a 64-byte scrypt output), `recovery_hash` is hashed with the same salt. The password `contrasenya-de-prova-1` and the code above appear nowhere:

```bash
sqlite3 /tmp/demo-copy.db "SELECT count(*) FROM compte WHERE password_hash LIKE '%contrasenya%' OR recovery_hash LIKE '%contrasenya%';"
```

```
0
```

Code: `packages/db/src/employee-repository.ts` (`scrypt` with a per-account random salt, constant-time comparison with `timingSafeEqual`, five attempts per 15 minutes, recovery code replaced by a new one after use).

For the seeded accounts, the same columns look like this (synthetic placeholder hashes, no recovery code yet because nobody has onboarded):

```bash
sqlite3 -header -column data/app.db "SELECT id, username, substr(salt,1,16)||'…' AS salt, substr(password_hash,1,24)||'…' AS password_hash, substr(recovery_hash,1,24)||'…' AS recovery_hash FROM compte LIMIT 3;"
```

```
id                username       salt               password_hash              recovery_hash
----------------  -------------  -----------------  -------------------------  -------------
8a99e8e189c33ac4  cim_brau11     0ff1584221c4e1ae…  df3af5e1acfe692d552f64e8…
34e0d869a6010769  vent_alegre79  9f0bcf77610d504c…  59c29b715fdc14561f14768a…
e6845856a084d0b4  bosc_ferm12    2be2d388b1f62d35…  3bce9005c9e92bb0aef2c82e…
```

Clean up afterwards:

```bash
rm /tmp/demo-copy.db
```

## Closing line

"HR can see groups of ten or more, never a person. That is enforced three ways: the linter, the CI check, and a database view without the account id."

## After the demo

```bash
pkill -f "next dev -p 3217"; rm -f data/results-fixtures.db*
git status   # should be clean
```

## Known limits to be honest about if asked

- The seed writes raw data only; the aggregates on `/hr/results` come from the `init` fixtures until the analysis job is merged.
- The rate limiter for login attempts is in memory (single process, prototype).
- The seeded accounts use a placeholder sha256 hash, not scrypt; real onboarding uses scrypt as shown in step 5.
