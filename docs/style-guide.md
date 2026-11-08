# Give a Damm: style guide

Source: Natan's style guide doc (2026-11-08), copied here so the website can be redone from the repo. It builds on [`visual-identity.md`](visual-identity.md) ("Paper") and replaces it where they differ. Not applied to the code yet. The section "Differences from the current code" at the end lists what a restyle has to change.

Logo, title and icon files are in [`docs/brand/`](brand/) (`svg/` and `png/`, from `give-a-damm-final.zip`).

In one line: Give a Damm is a quiet, serious tool with one loud voice. Ink on paper everywhere, and red only where someone is being heard.

## Principles

1. **Paper first.** Every screen starts as dark ink on warm paper. Type, spacing and 1px rules give the structure. No boxes, shadows or gradients.
2. **Red means a voice.** Signal red marks the moment a person speaks or is heard: the ear's dot, the full stop, the submit button, a new insight. Red used for anything else gets removed.
3. **Type does the talking.** Headlines in Hanken Grotesk 800, plain weights for the rest. Big, short, confident lines instead of decoration.
4. **Anonymity is visible.** Never show names, avatars or anything that looks like tracking. Say plainly what is anonymous, every time it matters.
5. **Two questions, no friction.** The employee app takes under 30 seconds. One question per screen, big tap targets, no menus to explore.
6. **Not a Damm ad.** No stars, gold, beer imagery or Damm lettering. The product serves Damm employees but does not wear the brewery's branding.

## Logo and title usage

The ear logo is the app's mark. The one-line title is the site header. Keep the stacked red title for one big moment per surface.

| Asset | File (`docs/brand/svg/`) | Use it for | Minimum size |
|---|---|---|---|
| Logo (ear on paper) | `logo-light.svg` | App icon, PWA, social avatar, footer mark | 24px wide |
| Logo, dark | `logo-dark.svg` | Dark-mode icon, dark slides | 24px wide |
| Logo, maskable | `logo-maskable.svg` | PWA maskable icon (glyph inside the safe zone) | – |
| Logo, mono | `logo-mono-ink.svg`, `logo-mono-reverse.svg` | One-colour print | 24px wide |
| Favicon | `favicon.svg` | Browser tab only | 16px |
| Symbol | `symbol.svg` (`currentColor` stroke, red dot), `symbol-mono.svg` | Inside the UI: loaders, empty states, the "you were heard" screen | 20px |
| One-line title (W4) | `title-oneline-light/dark/mono-ink/mono-paper.svg` | Website and app header, dashboard top bar, email signature | 120px wide |
| Stacked on red (W2) | `title-stacked-red.svg`, `title-stacked-red-dark.svg` | Splash screen, landing hero, first and last pitch slide | 200px wide |
| Stacked, no block | `title-stacked-light/dark/mono-ink.svg` | Print, factory posters, anywhere a red block is too much | 160px wide |

PNG renders in `docs/brand/png/`: `favicon-16/32`, `apple-touch-icon-180`, `icon-192`, `icon-512`, `icon-512-maskable`, `icon-dark-512`, and 1200px titles (`title-oneline-light/dark`, `title-stacked-red`).

- **Clear space:** around every mark, leave empty space equal to four times the height of the ear's red dot (about half the cap height). Nothing else goes in that zone.
- **One mark per view:** if the header shows the title, don't put the logo next to it. The ear already is the G.
- **Do not:**
  - recolour the ear, the dot or the full stop with anything outside the palette
  - set "Give a Damm" as live text with the ear pasted in front. Always use the supplied files.
  - rotate, outline or stretch any mark, or add effects
  - put the red-block title on a red or photographic background
  - use the red-block title more than once per screen or slide
  - put the logo next to Estrella Damm's star or wordmark as if they were one brand

## Colour

On any screen, roughly 85% paper, 13% ink and 2% red. Red is an event, not a background (the stacked red title is the one exception).

| Token | Light | Dark | Role | Contrast on its background |
|---|---|---|---|---|
| `--paper` | `#eef0ea` | `#121512` | Page background | – |
| `--surface` | `#fbfcf9` | `#1a1e1a` | Cards, inputs, the question sheet | – |
| `--ink` | `#17211a` | `#eef1ea` | Text, icons, primary strokes | 14.4:1 light, 16.1:1 dark |
| `--muted` | `#5b6359` | `#9aa196` | Secondary text, labels, timestamps | 5.4:1 light, 6.9:1 dark |
| `--rule` | `#cfd4c9` | `#2b302b` | 1px dividers and card borders | decorative only |
| `--red` | `#c8201a` | `#ff7a6e` | Voice: submit, ear dot, full stop, "new" markers | 5.0:1 light, 7.2:1 dark |
| `--on-red` | `#fbfcf9` | `#121512` | Text on red buttons | 5.6:1 light, 7.2:1 dark |

- Every text pair above passes WCAG AA for body text (4.5:1). Red text is fine for labels and single words only.
- `--rule` is never a text colour.
- Red never marks an error. Errors use ink, a short sentence and an outline warning icon, so red keeps meaning "a voice".
- Charts use ink, greys and at most one red series (see Components).
- Dark mode is a palette swap, not a redesign: same layout, same proportions.
- Never use gold, yellow or amber, a red-and-gold pairing, gradients or tinted overlays.

## Typography

One family, Hanken Grotesk, in four weights: 800 display, 700 section titles, 600 labels and buttons, 400 reading.

| Style | Mobile size / line | Desktop size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | 40 / 42px | 64 / 64px | 800 | −2% | Landing hero, thank-you screen |
| Question | 28 / 32px | 36 / 40px | 800 | −1.5% | The daily question |
| H1 | 24 / 28px | 32 / 36px | 800 | −1% | Page titles |
| H2 | 18 / 24px | 22 / 28px | 700 | −0.5% | Section titles, dashboard tile titles |
| Body | 16 / 24px | 17 / 26px | 400 | 0 | Paragraphs, explanations |
| Label | 14 / 20px | 14 / 20px | 600 | +1% | Buttons, form labels, tabs |
| Small | 13 / 18px | 13 / 18px | 400 | +1% | Meta, timestamps, footnotes |
| Number | 32 / 32px | 48 / 48px | 800 | −2% | Dashboard figures (tabular numerals) |

- Sentence case everywhere, buttons and headings included. No all-caps, except optional 12px overline labels with +8% tracking.
- A question ends with its full stop or question mark in `--red`, echoing the logo's full stop. Only questions get this, not every heading.
- Body text measure: 60 to 72 characters. On mobile, 16px minimum so iOS doesn't zoom into inputs.
- `font-variant-numeric: tabular-nums` on any number that changes or sits in a column.
- Catalan typography: the real punt volat `l·l` (U+00B7), typographic apostrophes `’`, «cometes» for quotations. Load the Latin Extended subset so à è é í ï ò ó ú ü ç render in Hanken, not a fallback font.
- Load only 400, 600, 700 and 800 (one variable font file). Fallback stack: `"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif`.

## Layout and spacing

Everything sits on a 4px grid with plenty of white space. Spacing and 1px rules separate things, not containers.

Spacing scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Default gap 16, 24 between groups, 48 or more between page sections.

| Surface | Max width | Columns | Side margin | Notes |
|---|---|---|---|---|
| Employee app (mobile) | 480px | 1 | 20px | One question per screen. Primary action pinned to the bottom, 16px above the safe area |
| Website / landing | 1120px | 12 | 24px mobile, 48px desktop | Text blocks at most 680px wide |
| HR dashboard | 1280px | 12 | 32px | Tiles snap to 3, 4, 6 or 12 columns. 24px gutters |

Shape:
- Corners: 2px on cards, inputs, buttons and tiles. 999px (pill) only for small status tags. The app icon keeps its own 6% radius.
- Borders: 1px `--rule` for cards and dividers, 1.5px `--ink` for focused or selected states.
- No shadows, blur, gradients or textures. Depth comes from `--surface` on `--paper` plus a 1px rule.
- Tap targets: at least 48 × 48px in the employee app.

## Components

Few components, each with one job. The red primary button is the only filled block of colour in normal UI.

### Buttons

| Type | Look | Use |
|---|---|---|
| Primary | `--red` fill, `--on-red` label at 600, 2px corners, 48px tall | One per screen: "Envia", "Respon ara" |
| Secondary | 1.5px `--ink` outline, ink label, transparent fill | "Omet", "Enrere", filters |
| Text | Ink label, underlined on hover and focus | Inline links, "Més informació" |

Hover darkens the fill or border by 8%, pressed by 16%. Disabled is 40% opacity, never a greyed-out red.

### Question card (employee app)

- Small overline: "Pregunta 1 de 2" in `--muted`.
- The question in the Question style, its final punctuation in `--red`.
- Answers below it, then the primary button pinned to the bottom.
- After the second answer: a full-screen thank-you with the ear symbol (48px) and "T’hem escoltat." in Display style.

### Answer controls

- Scale questions: 5 equal squares in a row (2px corners, 1px `--rule` border), with numbers or short words inside. Selected = `--ink` fill with paper text. Never emoji faces.
- Choice questions: full-width rows with a 1px rule between them. The selected row gets a 1.5px ink border and a check icon.
- Free text: one textarea, `--surface` fill, 1px rule, at least 120px tall, character counter in `--muted`. Always followed by "Anònim. No guardem el teu nom."

### Inputs (HR side)

`--surface` fill, 1px `--rule` border, 44px tall, label above in the Label style. Focus = 1.5px `--ink` border plus the focus ring (see Accessibility).

### Dashboard tiles

- `--surface` card, 1px rule, 24px padding, 2px corners.
- Title in H2, the big figure in the Number style, a one-line comparison in Small ("+6 pts vs. setmana passada").
- Every tile shows its respondent count ("n = 142"). Breakdowns under the minimum group size are hidden with "Massa poques respostes per mostrar-ho sense perdre l’anonimat." **The minimum is 10 in this product** (AGENTS.md, Product decisions). The source guide says 5. Ignore that.

### Charts

- Ink and two greys (`--muted`, `--rule`) for data. `--red` for one highlighted series or the latest point only.
- 1px gridlines in `--rule`. No chart borders, no 3D, no pie with more than 3 slices.
- Label values directly on bars or line ends instead of legends where possible.

### Tags

Pill-shaped, 12px Label style, 1px border. Status is a word ("Nou", "En curs", "Resolt") with an ink outline. Only "Nou" may be red.

## Iconography and imagery

Outline icons that match the ear's round, open line. No photos of people, no illustrations of faces.

- Icon set: round-cap outline on a 24px grid, 1.5px stroke, `currentColor`. Lucide or Phosphor (Regular) are close matches. Pick one and don't mix them.
- Sizes: 20px inline with text, 24px in navigation, 48px on empty and thank-you screens.
- The ear symbol is the only illustrative element: thank-you screen, empty states ("Encara no hi ha respostes") and loading. Don't put the red dot on other icons.
- Imagery: none in the employee app. On the website, abstract or typographic visuals only: big quotes from anonymised answers in Display style, numbers, simple charts.
- Never: stock photos of smiling teams, avatars, faces, emoji, mascots, beer, hops, bottles, glasses, stars.

## Voice and tone

The app talks like a colleague who actually listens: short, direct, warm, in Catalan, with "tu", never corporate. See also [`copy-guide.md`](copy-guide.md).

- Short: one idea per sentence. Buttons are one or two words.
- Honest about anonymity: say exactly what is and isn't stored, in plain words, every time someone writes free text.
- No hype and no guilt: never "Ajuda’ns a millorar!" or streak pressure. Skipping is always allowed.
- A little personality is fine when a loop closes (the thank-you, the "we did something about it" notes), never in instructions.

| Moment | Write | Avoid |
|---|---|---|
| Daily nudge | Dues preguntes. Menys d’un minut. | No t’oblidis de completar l’enquesta diària! |
| Free-text hint | Anònim. No guardem el teu nom. | Les teves dades seran tractades de manera confidencial segons la política… |
| After answering | T’hem escoltat. Fins demà. | Gràcies per la teva valuosa aportació! |
| Skip button | Omet | Saltar aquesta pregunta |
| HR acted on feedback | Vau dir que el torn de nit no té prou descans. Hem afegit una pausa de 15 minuts. | S’han implementat millores basades en el feedback. |
| Empty dashboard | Encara no hi ha prou respostes. Torna demà. | No data available |

The pun stays in the name and the odd closing line. "Give a Damm." on its own as a sign-off is fine. "Gràcies per donar-te’n un Damm." is too much. Don't build jokes around it.

## Motion and accessibility

Motion is brief and functional. Accessibility target is WCAG 2.2 AA: factory staff use the app on cheap phones, in bright light, often wearing gloves.

Motion:
- Durations: 120ms for hovers and presses, 200ms for screen and card transitions, 400ms for the one signature moment.
- Easing: `cubic-bezier(0.2, 0, 0, 1)` entering, `cubic-bezier(0.4, 0, 1, 1)` leaving.
- Signature moment: on "Envia", the ear's red dot pulses once (scale 1 → 1.4 → 1) before the thank-you screen. Nothing else bounces.
- With `prefers-reduced-motion`, every movement becomes a 120ms fade.

Accessibility:
- Every text pair in the Colour table passes AA. Keep it that way when adding colours.
- Focus: 2px `--ink` outline with a 2px offset on every interactive element (`--red` in dark mode, which reads better on `#121512`).
- Targets: at least 48 × 48px on mobile, 8px apart.
- Red never carries meaning alone: selected states also change the fill or add a check icon.
- Text scales to 200% without breaking the layout. No text in images.
- `lang="ca"` on the document so screen readers pronounce Catalan correctly.
- Every icon-only button has a Catalan `aria-label` ("Tanca", "Menú").

## Design tokens

From the source guide, ready for the global stylesheet. Every rule above maps to one of these variables. In this repo the font is loaded through `next/font` in `app/layout.tsx`, not with an `@import`.

```css
@import url("https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&display=swap");

:root {
  /* colour */
  --paper:   #eef0ea;
  --surface: #fbfcf9;
  --ink:     #17211a;
  --muted:   #5b6359;
  --rule:    #cfd4c9;
  --red:     #c8201a;
  --on-red:  #fbfcf9;
  --focus:   var(--ink);

  /* type */
  --font: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
  --fs-display: clamp(40px, 6vw, 64px);
  --fs-question: clamp(28px, 4vw, 36px);
  --fs-h1: clamp(24px, 3vw, 32px);
  --fs-h2: clamp(18px, 2vw, 22px);
  --fs-body: 16px;
  --fs-label: 14px;
  --fs-small: 13px;

  /* space (4px grid) */
  --s1: 4px;  --s2: 8px;  --s3: 12px; --s4: 16px; --s5: 24px;
  --s6: 32px; --s7: 48px; --s8: 64px; --s9: 96px;

  /* shape */
  --radius: 2px;
  --border: 1px solid var(--rule);
  --border-strong: 1.5px solid var(--ink);

  /* motion */
  --t-fast: 120ms;
  --t-base: 200ms;
  --ease-in: cubic-bezier(0.2, 0, 0, 1);
  --ease-out: cubic-bezier(0.4, 0, 1, 1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper:   #121512;
    --surface: #1a1e1a;
    --ink:     #eef1ea;
    --muted:   #9aa196;
    --rule:    #2b302b;
    --red:     #ff7a6e;
    --on-red:  #121512;
    --focus:   var(--red);
  }
}

html { background: var(--paper); color: var(--ink); font-family: var(--font); }
body { font-size: var(--fs-body); line-height: 1.5; }
h1, .display, .question { font-weight: 800; letter-spacing: -0.015em; line-height: 1.1; }
.question .end { color: var(--red); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.btn-primary { background: var(--red); color: var(--on-red); font-weight: 600;
  border: 0; border-radius: var(--radius); min-height: 48px; padding: 0 var(--s5); }
.card { background: var(--surface); border: var(--border); border-radius: var(--radius); padding: var(--s5); }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition-duration: var(--t-fast) !important; } }
```

## Differences from the current code

What the code does today (from `visual-identity.md`, "What changed in code"), and what this guide changes. Check each against the code before a restyle.

| Area | Today | This guide |
|---|---|---|
| Name | "Escolta activa" / "Escolta" (`app/wordmark.tsx`, `manifest.ts`, `layout.tsx` metadata, `offline.html`, push texts, poster, Teams card) | "Give a Damm", always from the title SVGs, never live text |
| Wordmark | Plain text, Hanken 800 | `title-oneline-*.svg` in headers, `title-stacked-*.svg` for hero, splash and posters |
| App icon | Ink square with a white "E" (`app/icon.svg`, `public/icons/*.png`) | Ear on paper: `logo-light.svg`, `logo-maskable.svg`, `favicon.svg` and the PNGs in `docs/brand/png/` |
| Primary button | Ink fill ("red never fills a button") | Red fill with `--on-red` text, one per screen |
| Token names | `--bg`, `--surface`, `--surface-muted`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--accent`, `--brand-red`, `--warn`, `--good`, `--line`, `--control-border`, `--on-accent` in `globals.css` | `--paper`, `--surface`, `--ink`, `--muted`, `--rule`, `--red`, `--on-red`, `--focus`. Map or rename them; HR uses `--surface-muted`, `--warn`, `--good` and the chart tokens, which the guide doesn't define, so keep those |
| Muted and rule colours | `--text-muted` `#52604f` / `#b2bcaf`, `--border` `#d3d9cc` / `#2f362f` | `--muted` `#5b6359` / `#9aa196`, `--rule` `#cfd4c9` / `#2b302b` |
| Errors | Text in `--warn` (`#a3331f`, a red-brown) | Ink sentence plus an outline warning icon. No red |
| Weights | 400, 500, 700, 800 | 400, 600, 700, 800 |
| Type scale | Page title 24/800, section 16/700, body 14px (16 on employee), 11px uppercase eyebrow | Scale in the Typography table. Overline 12px with +8% tracking, optional |
| Tap targets | 44px minimum | 48px minimum, 8px apart |
| Focus | 2px ink (3px employee) | 2px ink with 2px offset, red in dark mode |
| Question punctuation | Plain | Final `.` or `?` in `--red` |
| Thank-you screen | Text only | Ear symbol at 48px plus "T’hem escoltat." in Display, red-dot pulse on "Envia" |
| Theme colour | `themeColor` ink `#17211a`, manifest background `#eef0ea` | Paper background stays. Decide whether `theme_color` stays ink or becomes paper to match the new icon |
| Charts | Validated `--co-*`, `--dom-*` and heatmap palettes | Ink, greys and one red series. Changing the charts means re-running the dataviz palette validation, and colour must never carry meaning on its own |
| Minimum group size | 10 | Guide says 5. **Keep 10.** |

Before using the name on slides, check the "Damm" pun with a mentor or someone from Damm.
