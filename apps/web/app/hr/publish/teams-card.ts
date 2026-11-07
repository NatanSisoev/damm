import type { Lang } from "@damm/shared";
import { makeT } from "@/lib/i18n/core";
import { hrDict, collectiveLabel } from "@/lib/i18n/hr";
import { minutes } from "../labels";

/**
 * Microsoft Adaptive Card (schema 1.5) for announcing a collective's survey link in Teams.
 * Pure function: no I/O, no personal data. Can move behind an API later.
 */
export type AdaptiveCard = {
  $schema: string;
  type: "AdaptiveCard";
  version: "1.5";
  body: Record<string, unknown>[];
  actions: Record<string, unknown>[];
};

export function buildTeamsCard(opts: { collectiu: string; url: string; minGroup: number; lang: Lang }): AdaptiveCard {
  const t = makeT(hrDict, opts.lang);
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      { type: "TextBlock", text: t("teams_card_title", { minutes: minutes(2, opts.lang) }), weight: "Bolder", size: "Large", wrap: true },
      { type: "TextBlock", text: t("teams_card_collective", { name: collectiveLabel(opts.collectiu, opts.lang) }), isSubtle: true, spacing: "None", wrap: true },
      {
        type: "TextBlock",
        text: t("teams_card_privacy", { min: opts.minGroup }),
        wrap: true,
      },
    ],
    actions: [{ type: "Action.OpenUrl", title: t("teams_card_action"), url: opts.url }],
  };
}

/** Envelope Teams incoming webhooks / Workflows expect. */
export function teamsMessage(card: AdaptiveCard) {
  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
  };
}
