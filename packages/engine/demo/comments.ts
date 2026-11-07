// Template comments for the demo database. Invented, generic, never about identifiable people.

type Tone = "negative" | "neutral" | "positive";

export const COMMENTS: Record<number, Record<Tone, string[]>> = {
  1: {
    negative: [
      "I end most weeks exhausted.",
      "Too much pressure to hit the numbers, no time to breathe.",
      "I find it hard to switch off after work.",
      "The workload keeps growing and nobody says anything.",
    ],
    neutral: ["Some weeks are fine, others are very heavy.", "It depends a lot on the period.", "More breaks would help."],
    positive: ["I feel good, the pace is reasonable.", "Lately the workload is better balanced.", "I can disconnect well after work."],
  },
  2: {
    negative: [
      "My manager does not listen when we raise problems.",
      "Decisions come from above without any explanation.",
      "There is no feedback unless something goes wrong.",
      "I don't trust the way decisions are made in my area.",
    ],
    neutral: ["It depends on who is in charge that day.", "We only talk when there is a problem.", "Communication with management could be clearer."],
    positive: ["My manager is approachable and fair.", "We get regular, useful feedback.", "I feel supported by my manager."],
  },
  3: {
    negative: [
      "No real chance to grow here.",
      "Training is always the same and not useful.",
      "Promotion criteria are not clear at all.",
      "I have been doing the same tasks for years.",
    ],
    neutral: ["Some training would be welcome.", "Opportunities exist but you have to look for them.", "I would like to learn more about other areas."],
    positive: ["The last course was really useful.", "I have learnt a lot this year.", "I can see how to move up here."],
  },
  4: {
    negative: [
      "Good work is not recognised.",
      "Company news always reaches us late.",
      "I don't feel part of the company.",
      "It feels like there are two companies: head office and the rest.",
    ],
    neutral: ["Sometimes I feel part of it, sometimes not.", "Communication is improving slowly.", "More events with other teams would help."],
    positive: ["I am proud of working here.", "I feel part of the team and the company.", "The company's values are clear to me."],
  },
  5: {
    negative: [
      "There is tension in the team that nobody addresses.",
      "Conflicts are not handled fairly.",
      "Coordination with other departments is poor.",
      "Some people are not treated with respect.",
    ],
    neutral: ["Good with some colleagues, harder with others.", "We work in silos.", "The atmosphere changes a lot from week to week."],
    positive: ["Great atmosphere in my team.", "I can be myself at work.", "We help each other a lot."],
  },
  6: {
    negative: [
      "The schedule changes too often.",
      "Equipment is old and breaks down.",
      "The work space is not adequate.",
      "Breaks are often skipped because of the workload.",
    ],
    neutral: ["Conditions are acceptable, nothing special.", "Some tools need replacing.", "The schedule works most weeks."],
    positive: ["The new equipment is a big improvement.", "The schedule is stable and predictable.", "Good working conditions overall."],
  },
};

/** Recurring themes planted for specific collectives and domains, from a given date. */
export const THEME_COMMENTS: { collectiuId: number; domainId: number; from: string; texts: string[] }[] = [
  {
    collectiuId: 1,
    domainId: 6,
    from: "2026-10-01",
    texts: [
      "We are told about shift changes too late.",
      "They changed my shift with one day's notice.",
      "The new shift rota was not explained to anyone.",
      "Nobody knows who to ask about shift swaps.",
      "Shift changes are announced on the board the day before.",
    ],
  },
  {
    collectiuId: 2,
    domainId: 6,
    from: "2026-08-15",
    texts: [
      "It gets very hot in the warehouse in the afternoon.",
      "The safety gloves wear out too fast.",
      "We need better ventilation in the loading area.",
      "There is not enough water near the docks.",
      "Some safety equipment is missing on the night shift.",
    ],
  },
  {
    collectiuId: 2,
    domainId: 2,
    from: "2026-10-08",
    texts: [
      "Since the change of supervisor nobody explains anything.",
      "The new way of assigning routes was imposed without asking us.",
      "We raised a problem and were ignored.",
    ],
  },
];
