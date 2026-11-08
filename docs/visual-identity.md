# Visual identity: "Give a Damm"

Source of truth: [`style-guide.md`](style-guide.md) and the logo files in [`brand/`](brand/). This file records how the code applies them (refined 2026-11-08 on `jan/refine-design`, after the first "Give a Damm" pass on `jan/redesign` read as too loud). Red is now a small signal, not a fill.

One look for the employee PWA, the HR dashboard and the manager view. Idea: a quiet off-white page, near-black ink, 1px hairlines, small radii, no shadows, and red used only as a small signal (the ear dot, the active nav marker, critical badges, meters).

## Name and mark

- Product name is **Give a Damm** (PWA name and short name). Always rendered from the title SVGs, never as live text.
- `app/wordmark.tsx`: `Wordmark` renders `/brand/title-oneline-light.svg` and `-dark.svg` in a `<picture>` (dark variant by `prefers-color-scheme`; `light` forces the dark file for dark surfaces). Size it with an `h-*` class. `EarSymbol` is the inline symbol (currentColor stroke, red dot; `pulse` plays once).
- Files live in `apps/web/public/brand/`. App icon: `app/icon.svg`, `app/favicon.ico` and `public/icons/*.png` (ear on paper; maskable keeps the glyph in the safe zone).
- Relation to Estrella Damm: the small label "Persones · Estrella Damm" stays; no Damm star or proprietary font.

## Palette (`app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#fafaf8` | `#0f0f0e` | page |
| `--surface` | `#ffffff` | `#161615` | cards, inputs, bars |
| `--ink` | `#141414` | `#ececea` | text, icons, strokes, primary button |
| `--muted` | `#6a6a66` | `#9b9b96` | secondary text |
| `--rule` | `#e6e6e2` | `#262625` | 1px dividers |
| `--red` / `--on-red` | `#c8201a` / `#ffffff` | `#ff7a6e` / `#0f0f0e` | signal only: nav marker, critical badge, meters, ear dot |
| `--focus` | ink | ink | 2px outline, 2px offset |

The old names (`--bg`, `--text`, `--text-muted`, `--border`, `--accent`, `--brand-red`, `--line`, `--control-border`, `--on-accent`) are aliases of the new ones, so existing components keep working. `--accent` is ink (selected tiles, scale input) and `.btn-primary` is an ink fill with paper text: no red fills. `--warn` and `--good` are ink: status is carried by a label or outline, never by red. Chart tokens (`--co-*`, `--dom-*`, heatmap) are unchanged.

`themeColor` and the manifest use `#fafaf8` (dark: `#0f0f0e`). `public/offline.html` inlines the palette and caches the two title SVGs in the service worker.

## Type

Hanken Grotesk only, weights 400, 500, 600 (600 only where the weight remap in `globals.css` maps `font-bold`; `font-semibold` renders as 500). Tighter scale: page title 22-28px weight 500, section title 16px weight 500, eyebrow 11px weight 500 uppercase with 0.1em tracking, figures and tables use tabular numbers. Employee body is 16px, buttons and tap targets 48px. The HR shell keeps a 14px body for table density (documented deviation).

## Shape and motion

Radii 2-6px (controls 4px, cards 6px), 1px hairlines, no shadows or gradients, a 4/8px grid. Primary button: ink fill, one per screen. Secondary: 1px outline. Badges are transparent with a hairline border; critical is red text on a red hairline. Chart marks, meters and bars are 3px. Focus: 2px ring. `prefers-reduced-motion` disables the one-shot pulse and transitions.

## Voice

Unchanged: neutral, brief Catalan, "tu", verbs on buttons, privacy stated plainly. See `copy-guide.md`.

## Not applied

- Stacked title on red (splash, landing hero) and `title-stacked-*` are copied but not used: there is no splash or landing screen yet.
- HR body text is 14px, not the guide's 16/17px.
- The guide's optional 12px overline is not adopted; the 11px eyebrow stays.
- Teams card preview keeps Microsoft's own colours on purpose.
