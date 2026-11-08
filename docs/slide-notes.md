# Slide notes

Rule for the deck: slide headings are plain, neutral labels. On the slide, at most a few words or one figure. The arguments, views and numbers go in the speaker notes below, said out loud.

Each slide has: **Heading** (on the slide), **On slide** (the only visible content), **Speaker notes** (what to say). Keep a slide under 40 seconds unless marked.

Facts to use come from the product decisions in `AGENTS.md` and from the current `jan/dev`. Mark anything that depends on unfinished work and re-check it before the demo. Synthetic data only; say so once, early.

---

## 1. Context

**On slide:** Estrella Damm · Give a Damm · UAB THE HACK 2026

**Speaker notes**
- The challenge: an active-listening platform that creates tailored micro-surveys, gets representative participation, and turns answers into insights and actions, while always guaranteeing anonymity.
- We built the full loop, not one piece of it: need, questions, approval, publish, answer, analysis, dashboard, recommendation, follow-up.
- Everything you will see uses synthetic data. No real Damm or personal data anywhere.

## 2. Problem

**On slide:** Three gaps

**Speaker notes**
- Annual surveys are long, rare and answered by the people who already want to talk. Night shifts and plant floors answer least.
- Results come late and as averages, so a small group with a real problem disappears inside the mean.
- People do not answer if they fear being identified. Anonymity is the precondition, not a feature.
- So the three gaps: tailoring, representativeness, trust.

## 3. Approach

**On slide:** Listen, understand, act

**Speaker notes**
- Short, frequent questions instead of one long survey: about two a day, from a pool over six domains.
- A hybrid engine: continuous monitoring as the base, and an approved HR need enters the pool with top priority.
- Our view: the AI is useful at the edges, drafting and summarising, and it should never be the one who decides. The principle is "AI proposes, a human decides", and it is enforced in the product, not just stated.

## 4. Flow

**On slide:** One diagram, eight boxes

Need → Drafts → Approval → Publish → Answer → Analysis → Dashboard → Follow-up

**Speaker notes**
- Walk the diagram once, left to right, then say: "You will see this live."
- Point out the two human gates: approval before anything reaches employees, and the decision on recommendations before anything is acted on.
- Typeform and other channels are out on purpose: the app is the only channel, so we control anonymity end to end. "Publish" means the questions enter the pool and we generate a join link and a QR.

## 5. Live demo

**On slide:** Demo

**Speaker notes**
- Follow `docs/demo-script.md`. Step flags tell you what runs on the fixture data and what still depends on Natan's engine, AI and analysis, or on Jan's answer flow.
- If a step breaks, narrate it from slide 4 and move to the results step, which is the one that must work.

## 6. Domains

**On slide:** 4 collectives · 6 domains

**Speaker notes**
- Collectives: Fàbriques, Logística, Comercial, Oficines. Manager is a role flag, not a fifth collective, so managers can be compared without being a separate silo.
- Domains: Benestar, Lideratge, Desenvolupament, Cultura i pertinença, Entorn i relacions, Condicions i organització.
- Each collective gets a different subset of items per domain: a plant worker and an office worker are not asked the same things, which keeps questions relevant and short.

## 7. Anonymity

**On slide:** Minimum group: 10

**Speaker notes**
- Any group under 10 people, whether a collective, a shift, a period or a domain, is hidden everywhere, in the dashboard and in exports. In the radar it shows as a gap labelled "n<10", not as a number.
- The rule is enforced again on read, not only when the numbers are computed.
- Onboarding needs no email or phone: a join code identifies company and collective, then the person picks a username and password. The account maps to an opaque internal ID. Credentials are salted and hashed. Recovery uses a one-time code.
- No time tracking and no clock-in anchor: we never learn when someone worked.
- Admin sees only counts per collective, never identities.
- Longitudinal tracking per ID exists only to cluster trajectories. It is never shown per person and never leaves the analysis layer.

## 8. Architecture

**On slide:** One diagram, three layers

Employee app · Shared database · HR dashboard

**Speaker notes**
- One TypeScript monorepo, one backend process, one SQLite file, with clean internal modules: db, shared, engine, ai, analysis, seed. We chose that over microservices because it is faster to build and demo, and the module boundaries make splitting later cheap.
- The two sides meet only through the database and two endpoints: one to get the next questions, one to post answers.
- Analysis runs as jobs and writes aggregate tables. The dashboard reads only those. The LLM is never called while a dashboard page loads, so the dashboard is fast and cannot leak raw text.

## 9. Security boundary

**On slide:** Enforced in code

**Speaker notes**
- HR code can import only the HR repository and the shared types. A lint rule enforces this.
- A second check, `pnpm check:anonymity`, fails if HR code touches raw responses or accounts, or if the analytics view exposes an account ID. Say that you can run it live.
- Open comments are redacted of personal data before they are stored.
- Push subscriptions live in their own table, are deleted on logout and are never joined to analytics.
- The point to make: anonymity is a property of the code structure that anyone can check, not a policy promise.

## 10. Data

**On slide:** Synthetic, deliberately biased

**Speaker notes**
- About 1,200 synthetic employees as the denominator for representativeness, about 700 responses over three months (August, September, October 2026), and about 500 open comments.
- The comments were generated once with the LLM and committed as JSON, so anyone can seed the database without the key.
- We planted biases on purpose so the analysis has something to find: low night-shift response, an October emerging theme about shift-system communication and breaks, a weak signal in Logística about safety equipment and heat, positivity bias among managers, and one group below the threshold.
- Honest caveat: this proves the mechanics, not real findings. Say that plainly.

## 11. Results

**On slide:** Domain profile

**Speaker notes**
- The radar uses a fixed 1 to 5 scale and at most two series, so a comparison between periods or collectives stays readable.
- Representativeness compares who answered with who exists. Gaps of 5 points or more are flagged, and the night shift is the visible one. The shares are computed among visible groups only, so a hidden group cannot be inferred by subtraction.
- Our view: an insight without a representativeness figure next to it should not be trusted, so the figure is on the same page.

## 12. Themes and signals

**On slide:** Emergent · Weak signal

**Speaker notes**
- Themes come from clustering the comments. The October theme about shift communication and breaks is flagged as emergent because it grows from near zero over the three periods.
- The Logística signal about safety equipment and heat is small. An average would hide it. It is shown only because its group is above the minimum size.
- Say clearly: clustering, trends and weak-signal detection are Natan's analysis work. If it has landed by the demo, state it as live; if not, say the dashboard currently shows prepared aggregates. (Check this before presenting.)

## 13. Action

**On slide:** Recommendation · Follow-up

**Speaker notes**
- The AI proposes a recommendation from the signal. A person approves or discards it.
- One click turns an approved recommendation into a follow-up survey need, which goes back to review and approval. The loop is closed and it stays human-gated.
- Our view: a survey tool that stops at a chart creates work for HR; ours ends with a proposed action and the next question.

## 14. Limits

**On slide:** What it does not do

**Speaker notes**
- Synthetic data proves mechanics, not conclusions. A pilot with real, consented data is the next step.
- Self-selected response: we measure and flag the gap, but we cannot remove it.
- Small groups: the threshold of 10 protects people and costs resolution. For small sites, the group size would need a policy decision.
- Push notifications on iOS need the app added to the home screen; on Android they work either way.

## 15. Next steps

**On slide:** Future evolution

**Speaker notes**
- Split into services along the existing module boundaries: a central server that sends out questions and receives anonymised answers, and company-side apps.
- Native Android app with FCM through Capacitor, instead of the installable web app.
- More languages and more collectives; integration with HR systems only at aggregate level.
- Evaluation of question quality with real response data, so the engine learns which questions get honest answers.

## 16. Close

**On slide:** Gràcies

**Speaker notes**
- One sentence to leave: "Every employee can speak, HR can act, and nobody can be identified."
- Name the team and offer to run `pnpm check:anonymity` or show the code for any questions about trust.
- Leave the live app open on the results page for questions.

---

## Backup slides

Keep these hidden until asked.

### B1. Engine rules
- About two questions a day, never the same question four days in a row, more sampling on outliers, formats and timing per collective and shift. An approved HR need goes first. (Engine is Natan's work; confirm status before answering in detail.)

### B2. Why not a survey platform
- Third-party tools would put raw responses and identifiers in someone else's system. Owning the channel is what makes the anonymity guarantee checkable.

### B3. Stack
- TypeScript monorepo (pnpm), Next.js app as an installable web app, SQLite, OpenAI-compatible LLM gateway served by UAB DCC for drafting and clustering. The key lives only in `.env`.
