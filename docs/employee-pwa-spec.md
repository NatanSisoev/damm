# Employee PWA spec

Scope: the employee side only (onboarding, answering, push). Anything the HR side or analysis reads goes through the DB. Synthetic data only.

## Ownership of code

- Employee-side code may touch `compte`, `resposta` and `push_subscripcio`, and read `pregunta` and `joincode`.
- It never reads analysis tables and never imports `@damm/db/hr`.
- Shared contract (`packages/db/schema.sql`, `packages/shared`) changes only after agreement.

## Screens (mobile first, Catalan)

1. `/join/[codi]` (exists): shows company and collective for a valid code, "codi no vàlid" otherwise. "Continua" goes to onboarding.
2. `/onboarding`: pick username and password (the join code is carried in the session, not the URL query). On submit show the one-time recovery code once, with a "L'he desat" confirmation. No email, phone or name anywhere. For collectives whose population has shifts (derived from the data: today Fàbriques and Logística), one optional step follows: "Quin torn fas?" with Matí / Tarda / Nit / Prefereixo no dir-ho (default) and the line "Només per saber si arribem a tots els torns. Mai es mostra per persona." The choice is stored in `compte.torn_id` (NULL when skipped) and can be changed or cleared in `/settings` ("Torn"). It only feeds the per-shift response rate (representativeness banner, n >= 10); it is never shown per person.
3. `/login`: username and password. "He perdut la contrasenya" takes the recovery code and sets a new password; the used recovery code is cleared and a new one is shown.
4. `/` (home): today's questions, one at a time, with progress ("1 de 2"). Empty state: "Res més per avui".
5. Question renderers per `tipus`: `escala5`, `escala10`, `swipe`, `ranking`, `obert` (free text with a short note that it is anonymous and should not include personal data).
   **Extra one-off query (campaign):** when a published query has delivery "campaign" and the person has not answered it, `GET /api/pool/next` returns it in the separate `campaign` field and the home shows a card badged "Consulta extra" ("Consulta extra, només una vegada") above the daily set, with the intro, "Comença" and "Més tard". The set (all the query's questions, mixed types allowed) is answered in one go, once; it stays on the home until answered or HR closes the query. After it: "Has respost la consulta extra. Gràcies." Its questions never appear in the daily set, and the daily progress ("1 de 3") does not count them. The push for it has its own text ("Avui tens unes preguntes extra d'una consulta puntual...").
6. `/settings`: enable or disable notifications, change password, regenerate the recovery code (shown once), log out (deletes the push subscription), "Vull esborrar el compte" (confirm with password; answers stay as anonymous data).

## Accounts

- `compte.id`: random opaque id (`crypto.randomUUID()`), never derived from the username or the join code.
- `collectiu_id` comes from the join code. `centre_tipus_id`, `torn_id`, `es_manager` are optional self-declared answers in onboarding, asked as coarse choices only.
- Password: scrypt with a per-account random salt (`password_hash`, `salt`). Recovery code: random, stored hashed in `recovery_hash`, cleared when used.
- Session: HttpOnly, Secure, SameSite=Lax cookie carrying a signed `compte_id` (secret in `.env`, never in the repo). The account is always taken from the session, never from a request parameter.
- Rate-limit login and recovery attempts per username.

## Endpoints

`GET /api/pool/next` (session required) returns `PoolNextResponse` from `@damm/shared`: up to 2 questions for today. Selection comes from the engine package (`packages/engine`); until it exists, use a stub that returns approved questions for the account's collective, excluding ones answered in the last 4 days, approved HR needs first (`prioritat` descending).

`POST /api/responses` (session required) takes `PostResponsesRequest`:
- Validate with zod: each `preguntaId` is an approved question visible to the account's collective, `valorNum` within the question's scale, `obert` has a `comentari`. Any other question may also carry an optional `comentari` (a collapsed "Afegeix un comentari (opcional)" field under the answer; never required; open questions are never batch items, C23).
- Reject a repeat answer to the same question the same day.
- Pass `comentari` through the PII redactor (`packages/ai`) before insert; if the redactor is unavailable, store nothing rather than raw text.
- Set `periode` from the server date (`YYYY-MM`), `canal` from the request (`app` or `mobil_qr`).
- One `resposta` row per answered question. Return 204.

## Push notifications

- Service worker plus manifest make the app installable. VAPID keys in `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), `web-push` on the server.
- Permission is requested only after a user tap in `/settings` (required on iOS 16.4+ with the app added to the home screen).
- `POST /api/push/subscribe` stores one row in `push_subscripcio` keyed by `compte_id`; logout and account deletion remove it. It is never joined to analytics.
- A daily job (script or `POST /api/jobs/run`) sends a generic notification ("Tens preguntes noves") with no question text.
- Push needs public HTTPS, so use a tunnel or quick deploy for the phone demo.

## Anonymity rules for this side

- No personal data fields; usernames are shown nowhere except to their owner.
- Admin and HR never see identities. They see only counts of accounts per collective.
- No per-person history is exposed in any UI. Longitudinal use stays in the analysis layer.
- Do not log request bodies or comments.

## Build order

1. Session helper, scrypt helpers, account repository (employee-side only).
2. Onboarding, login, recovery.
3. `GET /api/pool/next` (stub selection) and the answer UI for all five question types.
4. `POST /api/responses` with validation and redaction hook.
5. PWA manifest and service worker.
6. Push subscribe, settings, daily send.
7. Swap the stub for `packages/engine`.

## Done means

Lint and build pass, a new account can onboard from a seeded join code, answer questions on a phone-sized viewport, and the data lands in `resposta` with no personal data. The seed package gives the pool and join codes to test against.

## Visual identity

The employee app follows "Paper" (`docs/visual-identity.md`): ink primary buttons, 2px corners, 1px rules, no shadows, a flat header with a rule under it, Hanken Grotesk only, 44px touch targets and 16px inputs. The scale input is a joined segmented row with the selected value filled in ink. Errors use the warn colour with a one-sentence message. The privacy note uses an outline lock icon, not an emoji. Join and login show "Persones · Estrella Damm" as plain text. Shared pieces live in `app/(employee)/components/frame.tsx`.
