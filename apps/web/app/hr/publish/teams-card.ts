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

export function buildTeamsCard(opts: { collectiu: string; url: string; minGroup: number }): AdaptiveCard {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      { type: "TextBlock", text: "Escolta activa: 2 minuts", weight: "Bolder", size: "Large", wrap: true },
      { type: "TextBlock", text: `Col·lectiu: ${opts.collectiu}`, isSubtle: true, spacing: "None", wrap: true },
      {
        type: "TextBlock",
        text: `Respostes anònimes i agregades: només es mostren grups de ${opts.minGroup} persones o més.`,
        wrap: true,
      },
    ],
    actions: [{ type: "Action.OpenUrl", title: "Respon ara", url: opts.url }],
  };
}

/** Envelope Teams incoming webhooks / Workflows expect. */
export function teamsMessage(card: AdaptiveCard) {
  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
  };
}
