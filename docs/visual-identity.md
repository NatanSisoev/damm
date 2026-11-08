# Visual identity: "Paper"

> **Superseded in part by [`style-guide.md`](style-guide.md) (2026-11-08):** new name "Give a Damm", ear logo and title files in `docs/brand/`, red primary buttons, and revised tokens. Read that first. This file stays as the record of what the code does today.

Decided by Jan on 2026-11-07 (option C of three: Llúpol, Mediterrània, Paper). One look for the employee PWA, the HR dashboard and the manager view. Status: **implemented 2026-11-07 on `jan/paper-identity`** (see "What changed in code" at the end).

Idea: ink on paper. Text first, thin rules, no decoration. Red is a signal, never a fill for decoration. It reads as a serious internal people tool, which supports the anonymity message.

## Name and mark

- Product name stays **Escolta activa** (short name in the PWA: **Escolta**).
- Wordmark is plain text in Hanken Grotesk 800. No logo lockup with a symbol.
- Do **not** use the Damm wordmark (`app/hr/damm-logo.tsx`, from Wikimedia) or the white "D" speech bubble icon. Both read as Damm's own branding. Replace them.
- App icon: ink `#0a0a0a` square with a white "E" or a plain speech-bubble outline. Maskable variant keeps the glyph inside the safe zone.
- Relation to Estrella Damm: a small text label such as "Persones · Estrella Damm" in the footer or the login. No logo, star, red-and-gold combination or proprietary font.

## Palette

Strict white, black and red (backlog #28). Source: `apps/web/app/globals.css`; `hr.css` reuses it. No tinted neutrals: every grey has equal R, G and B.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#000000` | page |
| `--surface` | `#ffffff` | `#0a0a0a` | cards, bars |
| `--surface-muted` | `#f2f2f2` | `#1a1a1a` | tracks, wells |
| `--border` / `--border-strong` | `#dcdcdc` / `#b3b3b3` | `#2e2e2e` / `#4a4a4a` | 1px rules |
| `--text` / `--text-muted` | `#0a0a0a` / `#4d4d4d` | `#ffffff` / `#b8b8b8` | text |
| `--accent` | `#0a0a0a` (ink) | `#ffffff` | primary buttons, focus, selected state |
| `--brand-red` | `#c8201a` | `#e0302a` | active nav tab, participation bar, alarms and weak signals only |
| `--warn` / `--good` | `#c8201a` / `#0a0a0a` | `#ff6b60` / `#ffffff` | status text with a label |

Outside the CSS tokens (phase 2): `themeColor`, `icon.svg`, the PNG icons in `public/icons` (background `#0a0a0a`, white glyph), manifest `background_color #ffffff` / `theme_color #0a0a0a`, and `public/offline.html` (light `#ffffff` / `#0a0a0a` / `#4d4d4d`, dark `#000000` / `#ffffff` / `#b8b8b8`). The Teams card preview (`hr/publish/[codi]/teams`) keeps Microsoft's own greys and purple on purpose, because it mimics Teams.

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

## What changes in code (implemented)

1. Move the `.hr-shell` tokens to `globals.css` (or a shared `theme.css`) and remove `.brand` / `brand.css`, `BrandHero`, Alfa Slab One and the stale zinc and black-sidebar tokens.
2. Retheme the employee screens: ink primary buttons, 2px corners, flat header instead of the hop hero.
3. Replace the Damm wordmark and the app icon; unify `themeColor` and manifest colours.
4. Load Hanken once. Replace the emoji.
5. Re-run the dataviz palette validation if any chart token changes.

Coordinate with the HR UI polish branch before touching `hr.css` or HR pages. Update `docs/employee-pwa-spec.md` and `docs/frontend-audit.md` when this lands.

## What changed in code (2026-11-07)

- `apps/web/app/globals.css` is the single token source (light and dark, 2px radii, `--line`, `--line-strong`, `--control-border` for 3:1 employee controls, `--on-accent`). `hr.css` keeps HR layout only. `brand.css`, `BrandHero`, `damm-logo.tsx`, Alfa Slab One and the zinc and black-sidebar tokens are gone.
- Employee screens share `(employee)/components/frame.tsx` (`EmployeeFrame`, flat `PageHead`, outline `LockIcon`, `PrivacyNote`, `CompanyLabel` "Persones · Estrella Damm"). `app/wordmark.tsx` is the text wordmark used by HR and the poster.
- Hanken Grotesk is loaded once in `app/layout.tsx` (400, 500, 700, 800). `themeColor` is ink `#0a0a0a`, manifest background `#ffffff`.
- `app/icon.svg` and the four PNG icons are regenerated (ink square, white E, maskable keeps the glyph in the safe zone). `public/offline.html` follows the same palette and supports dark mode.
- Chart tokens (`--co-*`, `--dom-*`, heatmap) moved unchanged, so the dataviz palette validation was not re-run.
- Error text uses `--warn` now, because the accent is ink and no longer distinct from body text.
