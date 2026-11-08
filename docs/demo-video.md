# Demo video and live demo plan

Agreed with Jan on 2026-11-08. Replaces the video parts of `demo-script.md` (the live click paths there still apply). Synthetic data only.

## Format

- Total slot: **3:00**, two presenters (P1 on the laptop, P2 on the phone).
- Order: **video (about 1:05), then live (about 1:45), then a 10 s close.**
- The video is narrated live by P1 over a silent clip. No recorded voiceover, no subtitles. On screen only the product's own Catalan copy and short title cards.
- Video language: Catalan UI and cards. Add an English title card at the start for the jury.
- Tooling: Remotion, built outside the repo (`~/development/escolta-video`), from stills of the real app plus animated cards. No screen recording.
- Product name on cards: **Give a Damm** ("Persones · Estrella Damm"), look "Paper" (see `visual-identity.md`).

## Story thread

One example runs through both parts: **shift communication and breaks in Fàbriques** (the October emerging theme). The video shows it as a quiet pattern in the data; the live part shows the same kind of thing being caught as it happens.

## Run of show

| Time | Where | Beat | Content |
| --- | --- | --- | --- |
| 0:00 to 0:08 | Video | Hook | Title card, then the problem: annual surveys come late and averages hide small groups. Ends on the question "What if HR heard it before it grows?" |
| 0:08 to 0:25 | Video | The brain | Animation: questions flow from the pool over 6 domains to the 4 collectives. Rule labels appear: about 2 a day, no same question 4 days in a row, more sampling on outliers, approved HR needs first. |
| 0:25 to 0:45 | Video | Analytics | Real stills: radar ("Perfil per domini"), representativeness with the night-shift gap, "Suprimit" on a group under 10, "Emergent" theme, Logística weak signal. Slow zooms, animated cursor. |
| 0:45 to 0:53 | Video | Manager view | Short shot of `/manager`: one collective, read-only. Cut if the video runs long. |
| 0:53 to 1:05 | Video | Anonymity | Cards: "Mínim 10 persones per grup.", "Cap resposta individual.", "L'administració només veu recomptes." Ends with the hook into the live part: "Ara, en directe." |
| 1:05 to 1:25 | Live (P1) | Need and drafts | Paste the need into `/hr/needs`, generate drafts. Pre-warmed drafts are ready if the gateway is slow. |
| 1:25 to 1:40 | Live (P1) | Human approval | Edit one question, "Aprova" two, "Descarta" one. Say it: the AI proposes, a person decides. |
| 1:40 to 1:50 | Live (P1) | Publish | Publish to the collective. The push lands on P2's phone. |
| 1:50 to 2:10 | Live (P2) | Answer | P2 answers two questions on the phone, anonymously. |
| 2:10 to 2:50 | Live (P1) | Alert and loop | An alert appears on the laptop. Walk the loop: Detect, Act, Re-measure, Learn. |
| 2:50 to 3:00 | Close | One line | "Every employee can speak, HR can act, and nobody can be identified." |

3:00 is tight. If rehearsal overruns, cut in this order: manager view, the Re-measure and Learn detail, the second approval.

## Decisions

- **Alert reliability:** seed the DB so one or two phone answers tip a pre-armed alarm through the real engine job. Rehearse 3 times on the exact demo DB. Keep a second armed alarm and a screenshot of the alert as fallback. Confirm the trigger path with the alarm-push work before the freeze.
- **Manager view:** in the video (0:45 to 0:53).
- **Backup clip:** a 15 s phone recording of the push, for R-DEL-8, in case the live push fails.
- **Music:** none.

## Before recording or going live

1. Rebuild the demo DB on current `jan/dev` (`pnpm demo-db`) and re-capture the stills. The first capture came from a build 21 commits behind and its labels did not match. Check every quoted label against the stills.
2. The demo DB must hold a draftable need (no already-published English need) and the planted October theme, Logística signal and suppressed group.
3. Phone push needs public HTTPS, the PWA on the home screen on iOS, and the venue network tested.
4. No secrets and no real data in any frame (R-X-1, R-X-4).

## Open

- Who is P1 and who is P2.
- Narration language (assumed Catalan).
- Exact need text to paste live.
