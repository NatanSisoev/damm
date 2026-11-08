# Visual identity: "Give a Damm"

Source of truth: [`style-guide.md`](style-guide.md) and the logo files in [`brand/`](brand/). This file records how the code applies them (implemented 2026-11-08 on `jan/redesign`). It replaces the "Paper" identity of 2026-11-07 (ink buttons, text wordmark, white "E" icon).

One look for the employee PWA, the HR dashboard and the manager view. Idea: a warm paper page, green-black ink, thin rules, and red used as the voice of the product (the one action per screen, the full stop, the ear dot), never as an error colour.

## Name and mark

- Product name is **Give a Damm** (PWA name and short name). Always rendered from the title SVGs, never as live text.
- `app/wordmark.tsx`: `Wordmark` renders `/brand/title-oneline-light.svg` and `-dark.svg` in a `<picture>` (dark variant by `prefers-color-scheme`; `light` forces the dark file for dark surfaces). Size it with an `h-*` class. `EarSymbol` is the inline symbol (currentColor stroke, red dot; `pulse` plays once).
- Files live in `apps/web/public/brand/`. App icon: `app/icon.svg`, `app/favicon.ico` and `public/icons/*.png` (ear on paper; maskable keeps the glyph in the safe zone).
- Relation to Estrella Damm: the small label "Persones · Estrella Damm" stays; no Damm star or proprietary font.

## Palette (`app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#eef0ea` | `#121512` | page |
| `--surface` | `#fbfcf9` | `#1a1e1a` | cards, inputs, bars |
| `--ink` | `#17211a` | `#eef1ea` | text, icons, strokes, selected state |
| `--muted` | `#5b6359` | `#9aa196` | secondary text |
| `--rule` | `#cfd4c9` | `#2b302b` | 1px dividers |
| `--red` / `--on-red` | `#c8201a` / `#fbfcf9` | `#ff7a6e` / `#121512` | primary button, ear dot, final punctuation, new markers |
| `--focus` | ink | `--red` | 2px outline, 2px offset |

The old names (`--bg`, `--text`, `--text-muted`, `--border`, `--accent`, `--brand-red`, `--line`, `--control-border`, `--on-accent`) are aliases of the new ones, so existing components keep working. `--accent` stays ink (selected tiles, scale input); only `.btn-primary` is red. `--warn` and `--good` are ink: status is carried by a label or outline, never by red. Chart tokens (`--co-*`, `--dom-*`, heatmap) are unchanged.

`themeColor` and the manifest use `#eef0ea` (dark: `#121512`). `public/offline.html` inlines the palette and caches the two title SVGs in the service worker.

## Type

Hanken Grotesk only, weights 400, 600, 700, 800 (500 is not loaded; use 600). Utility classes `.display`, `.question`, `.figure` follow the guide's scale. Employee body is 16px, buttons and tap targets 48px. The HR shell keeps a 14px body for table density (documented deviation).

## Shape and motion

2px corners, 1px rules, no shadows or gradients. Primary button: red fill, one per screen. Secondary: 1.5px ink outline. Focus: 2px ring. `prefers-reduced-motion` disables the one-shot pulse and transitions.

## Voice

Unchanged: neutral, brief Catalan, "tu", verbs on buttons, privacy stated plainly. See `copy-guide.md`.

## Not applied

- Stacked title on red (splash, landing hero) and `title-stacked-*` are copied but not used: there is no splash or landing screen yet.
- HR body text is 14px, not the guide's 16/17px.
- The guide's optional 12px overline is not adopted; the 11px eyebrow stays.
- Teams card preview keeps Microsoft's own colours on purpose.
