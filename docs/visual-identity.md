# Visual identity: "Paper"

Decided by Jan on 2026-11-07 (option C of three: Llúpol, Mediterrània, Paper). One look for the employee PWA, the HR dashboard and the manager view. Status: **spec only, not implemented yet.**

Idea: ink on paper. Text first, thin rules, no decoration. Red is a signal, never a fill for decoration. It reads as a serious internal people tool, which supports the anonymity message.

## Name and mark

- Product name stays **Escolta activa** (short name in the PWA: **Escolta**).
- Wordmark is plain text in Hanken Grotesk 800. No logo lockup with a symbol.
- Do **not** use the Damm wordmark (`app/hr/damm-logo.tsx`, from Wikimedia) or the white "D" speech bubble icon. Both read as Damm's own branding. Replace them.
- App icon: ink `#17211a` square with a white "E" or a plain speech-bubble outline. Maskable variant keeps the glyph inside the safe zone.
- Relation to Estrella Damm: a small text label such as "Persones · Estrella Damm" in the footer or the login. No logo, star, red-and-gold combination or proprietary font.

## Palette

Tokens already exist in `apps/web/app/hr/hr.css` and become the single source for all routes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#eef0ea` | `#121512` | page |
| `--surface` | `#fbfcf9` | `#1a1e1a` | cards, bars |
| `--surface-muted` | `#e6e9e0` | `#232823` | tracks, wells |
| `--border` / `--border-strong` | `#d3d9cc` / `#b9c1b0` | `#2f362f` / `#434c43` | 1px rules |
| `--text` / `--text-muted` | `#17211a` / `#52604f` | `#eef1ea` / `#b2bcaf` | text |
| `--accent` | `#17211a` (ink) | `#eef1ea` | primary buttons, focus, selected state |
| `--brand-red` | `#c8201a` | `#ff7a6e` | active nav tab, participation bar, alarms and weak signals only |
| `--warn` / `--good` | `#a3331f` / `#1d6b34` | `#ff9a86` / `#7fd194` | status text with a label |

Rules:
- Primary buttons are ink, not red. Red never fills a button.
- One source for red: PWA `theme_color`, manifest and icon use `#c8201a` or ink, not `#eb0505`.
- Chart palettes (`--co-*`, `--dom-*`, diverging heatmap) stay as validated. Never encode meaning by colour alone: always a label, value or pattern.

## Type

- **Hanken Grotesk only**, weights 400, 500, 700, 800. Load once in the root layout (today it is loaded twice).
- Page title 24px/800, section title 16px/700, body 14px (16px on the employee app for touch), eyebrow 11px/700 uppercase with 0.06em tracking.
- Drop Alfa Slab One, Inter and Geist Mono from the UI. Numbers use tabular figures.

## Shape

- Corners 2px (buttons, inputs, cards, badges). No pills, no 10 to 14px radii.
- 1px rules instead of shadows. No gradients, no hop texture, no outline display type.
- Employee app keeps the 44px minimum touch targets and 16px inputs. Scale input is a joined segmented row with 1px borders, selected item filled with ink.
- Focus: 2px ink outline (3px on the employee app).

## Iconography

- Almost none. Text and numerals carry meaning.
- Where an icon is needed: outline, 1.5px stroke, 16 or 20px, currentColor. No emoji (replace the 🔒 in `PrivacyNote` with an outline lock or plain text).

## Tone of the Catalan copy

- Neutral, brief, direct. Use "tu" (as today). No humour, no exclamation marks, no corporate filler.
- Privacy is stated plainly and concretely: "Anònim. Mínim 10 persones per grup."
- Buttons are a verb: "Envia", "Continua", "Publica".
- Errors say what happened and what to do, in one sentence.
- Labels in sentence case. HR copy stays in the same register, only more technical.

## What changes in code (when Jan asks to implement)

1. Move the `.hr-shell` tokens to `globals.css` (or a shared `theme.css`) and remove `.brand` / `brand.css`, `BrandHero`, Alfa Slab One and the stale zinc and black-sidebar tokens.
2. Retheme the employee screens: ink primary buttons, 2px corners, flat header instead of the hop hero.
3. Replace the Damm wordmark and the app icon; unify `themeColor` and manifest colours.
4. Load Hanken once. Replace the emoji.
5. Re-run the dataviz palette validation if any chart token changes.

Coordinate with the HR UI polish branch before touching `hr.css` or HR pages. Update `docs/employee-pwa-spec.md` and `docs/frontend-audit.md` when this lands.
