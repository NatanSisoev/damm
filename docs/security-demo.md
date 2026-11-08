# Security and anonymity demo (2 minutes)

Goal: show the judges that anonymity is enforced by the code and the database, not by good intentions. Five proofs, about 25 seconds each.

Every step runs on the one demo database. Account ids, salts and hashes change on every run, so yours will differ in the hex strings; everything else is the same.

## Setup (before going on stage)

```bash
source ~/.claude/bin/heavy-gate.sh   # shared lock + memory check, then:
pnpm install
pnpm demo-db      # about 90 s, writes data/app.db (1 Aug to 7 Nov 2026, ca/es/en, every segment n >= 10)
pnpm dev          # http://localhost:3000, /hr opens without login unless HR_ACCESS_CODE is set
```

`data/app.db` is the only database. Steps 1 and 2 need no data. Step 3 works on a scratch copy of it (the original is never modified). Steps 4 and 5 read it, and step 5 registers one account on a scratch copy.

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
Anonymity check passed: 10 HR data file(s), HR app imports and v_resposta_analitica are clean.
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

## 3. Groups under 10 are suppressed (c), 45 s

Say: "Minimum group size is 10. Below that, the number is not hidden by the UI, it never leaves the repository. I will make a group small on a scratch copy and show you."

The demo data has no group under 10 by design (every dashboard cell has a value). So the proof thins one segment on a copy: Comercial in October keeps 6 respondents, the analysis job runs again on the copy, and we read the result through the HR repository and the CSV export, the two ways data can leave the system.

```bash
source ~/.claude/bin/heavy-gate.sh
bash scripts/suppression-demo.sh
```

It copies `data/app.db` to `/tmp/damm-suppression-demo.db`, thins the segment, runs `pnpm --filter @damm/engine run job` and the health check on the copy, and prints:

```
2026-10  Comercial  6           1            <- raw agregat row: n=6, no mean, suprimit=1 (HR code never reads this table)
HEALTHY: 17 passed, 0 warnings, 0 failed     <- includes "suppression: agregat/insight/senyal: every row with n < 10 is suppressed with NULL values"
getRepresentativeness() ...                  <- Comercial is hidden (motiu primari)
tendencia,2026-10,Comercial,,Benestar,,,,,,1,,,   <- CSV: blank values, suprimit=1, for all six domains
tendencia,2026-10,Oficines,,Benestar,,,,,,1,,,    <- Oficines is hidden too (complementary suppression)
```

Point at three things:
- the raw row holds `n=6` and no mean: the job already wrote `suprimit=1` with NULL values, so there is nothing to leak;
- the CSV rows for Comercial in October are blank with `suprimit=1`, while August and September still show values;
- **Oficines is hidden as well**, although it has plenty of respondents. With the company total public and only Comercial missing, anyone could subtract the visible groups and recover Comercial. Complementary suppression (`packages/db/src/hr-rigour.ts`) hides one more group so the hidden number cannot be recovered.

Optional, not part of the timed demo and not rehearsed: run the app on the copy in a second terminal (the server on `data/app.db` can stay up on port 3000) and look at `http://localhost:3217/hr`; the dashboard reads the newest period with 10 or more respondents (`readingPeriod`), so it may open on November. The CSV (button "Exporta CSV" on `/hr/settings`, route `/hr/results/export`) carries every period.

```bash
cd apps/web && DB_PATH=/tmp/damm-suppression-demo.db pnpm exec next dev -p 3217
```

If there is no time to run the script, the explanation of the same rules is on `/hr/methodology` (k-anonymity: primary suppression under 10, complementary suppression, precision labels indicativa under 30, moderada 30 to 99, sòlida from 100).

Code: `MIN_GROUP_SIZE = 10` in `packages/shared/src/index.ts`; primary and complementary suppression in `packages/db/src/hr-repository.ts` (`buildRep`, `segmentCounts`) and `packages/db/src/hr-rigour.ts`, used by the pages and `exportResultsCsv()`. Comment themes and searches with fewer than 10 comments return `suppressed: true` with no number (`packages/db/src/hr-comments.ts`).

Clean up afterwards:

```bash
pkill -f "next dev -p 3217"; rm -f /tmp/damm-suppression-demo.db /tmp/damm-suppression-demo.db-shm /tmp/damm-suppression-demo.db-wal
```

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
8    score            REAL     0                    0
9    comentari        TEXT     0                    0
10   periode          TEXT     0                    0
11   data             TEXT     0                    0
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
       c.es_manager, r.valor_num, r.score, r.comentari, r.periode, r.data
FROM resposta r
JOIN compte c   ON c.id = r.compte_id
JOIN pregunta p ON p.id = r.pregunta_id
```

A sample row (an answer, its question, its group, a redacted comment, no person):

```bash
sqlite3 data/app.db "SELECT * FROM v_resposta_analitica LIMIT 2;"
```

```
1|169|6|1|1|1|0|1.0|1.0||2026-08|2026-08-01 08:57:12
2|36|2|1|1|1|0|1.0|1.0|Depèn de qui mana aquell dia.|2026-08|2026-08-01 08:57:12
```

The view is defined in `packages/db/schema.sql`. Step (b) fails the build if someone adds `compte_id` or a `*` to it.

## 5. Credentials are salted hashes, recovery codes too (e), 30 s

Say: "There is no email, no phone, no name. An account is a random id, a username, and salted hashes. Not even we can read the password or the recovery code."

The schema says it (`packages/db/schema.sql`): `compte` has `username`, `password_hash`, `salt`, `recovery_hash`, and nothing personal.

The demo accounts (`demo3`, `demo5` and so on) have placeholder credentials and no usable password, so to show the real scrypt hashes and a real recovery code, register one account through the real onboarding code (join code `DEMO-LOG`, override with `JOIN_CODE`) on a scratch copy of the database. Never point this at `data/app.db`.

```bash
sqlite3 data/app.db ".backup '/tmp/demo-copy.db'"
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
id       username  salt   password_hash  recovery_hash
-------  --------  -----  -------------  -------------
acc0003  demo3     demo…  demo…
acc0005  demo5     demo…  demo…
acc0008  demo8     demo…  demo…
```

Clean up afterwards:

```bash
rm -f /tmp/demo-copy.db /tmp/demo-copy.db-shm /tmp/demo-copy.db-wal
```

## Closing line

"HR can see groups of ten or more, never a person. That is enforced three ways: the linter, the CI check, and a database view without the account id."

## After the demo

```bash
pkill -f "next dev -p 3217"; rm -f /tmp/damm-suppression-demo.db /tmp/demo-copy.db
git status   # should be clean
```

## Known limits to be honest about if asked

- The rate limiter for login attempts is in memory (single process, prototype).
- The demo accounts use placeholder credentials and cannot log in; real onboarding uses scrypt as shown in step 5.
- The demo data has no group under 10 (so the dashboard looks complete); step 3 creates one on a scratch copy on purpose.
- `/hr` opens without a login unless `HR_ACCESS_CODE` is set; set it for any shared or public deployment.
