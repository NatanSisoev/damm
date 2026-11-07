# Demo walkthrough

A 2-minute story on the demo database, plus one slide on how the engine works. The numbers below come from `pnpm --filter @damm/engine run demo` with the default seed (`damm-demo`), run on 31 Oct 2026. Rebuild the database before rehearsing and run the app with `DB_PATH=data/demo.db`. Page names are placeholders until the HR pages are final.

## Before going on stage

1. `pnpm --filter @damm/engine run demo`: builds `data/demo.db` (about 4 min).
2. `DB_PATH=data/demo.db pnpm dev`. The scheduler recomputes every 10 minutes. Nothing changes unless new answers arrive.
3. Open the employee app on a phone (join link / QR) with a demo account, and the HR dashboard on the laptop.
4. Optional: `pnpm --filter @damm/engine run health` once it exists. It must say PASS.

## The story (about 2 minutes)

**1. "Ask, don't survey" (employee phone, 20 s)**
- Show today's 3 questions: one swipe (yes/no), one 1–5 scale, one this-or-that. The whole thing takes under 30 seconds.
- Say: "Every day each person gets 3 quick questions, chosen for them. Factory workers get swipes, offices get rankings. Nobody sees the same question twice in a month, and the answers can't be traced back to anyone: the login isn't linked to the employee."

**2. The dashboard has a story to tell (HR, 30 s)**
- Open the results for **Fàbriques**. *Condicions i organització* went from **5.5 to 4.4** in October, with **confidence 68** and **consensus 72**.
- Say: "Every score comes with how sure we are and how much people agree. 68 means we have enough answers to trust this drop."
- The header shows **2 critical alarms**. Open the *sharp drop* alarm: "Score fell 1.1 points (5.5 → 4.4) since the previous period."

**3. Why? Let the comments speak (HR, 20 s)**
- The theme behind the drop, from redacted comments (n ≥ 10): "We are told about shift changes too late" (85 mentions), "They changed my shift with one day's notice" (73).
- The *importance vs satisfaction* card puts **Condicions** in **"act first"** for Fàbriques: importance 0.77, score 4.4.

**4. AI proposes, HR decides (HR, 30 s)**
- HR already published a need: "How well are shift changes communicated?". It became two questions that the engine put at the front of the factory batches: 128 answers, and 72% say they were told in time.
- Acknowledge the alarm and link an action ("Shift rota published 2 weeks ahead"). The status changes to *action linked*. The engine never closes an alarm a human owns.
- Once narrative insights are in: show the LLM summary and its suggested actions, still marked *proposed* until HR approves.

**5. The engine listens to individuals without exposing them (HR, 20 s)**
- **Logística, morning shift, Lideratge**: a **critical changepoint cluster**. "15 people in this segment show a confirmed drop in this domain."
- Say: "When someone's answers suddenly change, the engine asks them a follow-up a few days later. Only the person sees it. HR sees only that 15 or more people confirmed the change: never who."
- **Oficines, Entorn i relacions**: the *polarisation* alarm. Consensus fell **19 points (74 → 55)** while the average barely moved. "An average alone would have hidden this."

**6. Close (10 s)**
- "Small daily questions, statistics that know how sure they are, follow-ups that make people feel heard, and anonymity built into the engine, not promised in a policy."

## Backup facts (for questions)

- **Scale:** 1,200 synthetic employees, 344 accounts, about 95,000 answers over 3 months, 165 questions, 7 types.
- **Suppression:** any group under 10 people is hidden everywhere, for example the night shifts in Logística (8 accounts).
- **Manager optimism:** in Fàbriques, managers rate Lideratge 7.2 against 5.9 for everyone else. It's shown as a gap card, not mixed into a single number.
- **Follow-ups are honest:** in Logística Lideratge, 40% of follow-ups confirmed the change and the rest were noise. The engine doesn't cry wolf on one bad day.
- **Tested against ground truth:** on a simulated world with known answers, scores are off by 0.3 on the 0–10 scale. Confidence is calibrated (z rms ≈ 1.1, where 1 is perfect), and there were 0 false alarms in 44 control segments.

## Slide: how the engine works

**Title:** The engine. Ask little, learn a lot, expose nothing.

| | |
|---|---|
| **Ask** | 3 questions a day, chosen per person: follow-ups first, then HR needs, then the domains we are least sure about. The question format is learned per collective (Thompson sampling), within HR's preferences. |
| **Learn** | Every answer becomes a 0–1 score, whatever the format. Each person has a trajectory per domain (a Kalman filter), and wording bias is learned and removed. |
| **Measure** | Per group: **score**, **confidence** (how sure we are, which fades as answers age) and **consensus** (how much people agree). |
| **Act** | Insight cards and alarms with severity, routing and hysteresis. An LLM drafts summaries and actions; HR approves. |
| **Protect** | Only groups of 10 or more people leave the engine. Managers never see leadership alarms about themselves. Logins aren't linked to employee identity. |

Speaker note: "It's Bayesian statistics, not a black box: every number on screen can be explained, and it adapts to each collective from its own answers."
