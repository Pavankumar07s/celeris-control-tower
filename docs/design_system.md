# Design system: Editorial Precision in black, orange and cream

This is the canonical, as-built design system of the Celeris control tower (`dashboard/`). Code against it. The
Executive overview (`dashboard/src/views/Overview.tsx`) is the reference implementation: when in doubt, copy what it does.

All twelve views are built on this system (integration pass, 24 Nov 2026; fix round and extra-large screens, 25 Nov
2026); the per-view gate results are in
[`docs/design_gate_results.md`](design_gate_results.md).

The dashboard reads like a well-edited planning report set in the team owner's black / orange / cream palette (the
"rover-hire" look): cream paper for content, black bands for navigation and the footer, one scarce orange. Typography
leads; rules and whitespace replace boxes; every chart title states its conclusion; annotations tell the story.

> **The one rule: ink is the past, orange is the future.** History, actuals and anything already known are drawn in
> ink (near-black on cream, chalk on black). The forecast, its band and anything predicted are drawn in orange. Orange
> is scarce: it means the forecast, the one active / selected marker, and the primary action. No other colour is loud,
> and no blue is used anywhere as an identity or interactive colour.

> **Superseded.** The mocks and spec in `research/scratch/design-editorial/` (not kept in the repository) used cobalt for
> the forecast on a near-white page. Their **colours are superseded** by this document (team owner's decision,
> 24 Nov 2026); they remain the bar for layout, typography and composition only.

## 0. Before you start (mandatory)

1. Load the two skills the team owner supplied, with the Skill tool, before touching a view:
   - **`ui-ux-pro-max`** (`.claude/skills/ui-ux-pro-max/`; first priority, "use this first"). How it applies here:
     `research/dashboard-skill-ui-ux-pro-max.md`.
   - **`dashboard-designer`** (`.claude/skills/dashboard-designer/SKILL.md`). How it applies here:
     `research/dashboard-design-skills.md`, section 9.
   - Also load **`dataviz`** before writing chart code (palette validation, mark specs).
2. Every view must pass **both acceptance gates in [§13](#13-acceptance-gates-every-view-before-it-ships)**: the
   18-point UI/UX Pro Max gate first, then the 16-point dashboard-designer gate.

Contents: [1 Principles](#1-principles) · [2 Colour](#2-colour) · [3 Typography](#3-typography) ·
[4 Layout and shell](#4-layout-and-the-shell) · [5 Components](#5-components) · [6 Charts](#6-charts) ·
[7 Headline templates](#7-headline-templates) · [8 Numbers and copy](#8-numbers-and-copy) ·
[9 Accessibility](#9-accessibility) · [10 Do and don't](#10-do-and-dont) ·
[11 Restyling a view](#11-restyling-a-view-checklist-and-per-view-notes) · [12 Files](#12-file-map) ·
[13 Acceptance gates](#13-acceptance-gates-every-view-before-it-ships)

---

## 1. Principles

1. **Answer first, evidence second.** Every view runs: headline → standfirst → hero evidence → supporting modules →
   detail. A planner who reads only the headline leaves with the answer.
2. **Ink is the past, orange is the future.** Colour carries time. Semantic colour (loss, status) appears only where it
   means something, always with a word or an icon.
3. **Conclusion titles, computed.** Headlines and module titles are sentences built from the data by deterministic
   templates, never typed numbers. When a template's condition fails, a descriptive title is used ([§7](#7-headline-templates)).
4. **Annotate instead of legend-hunting.** The key sits inline above the chart; the story lives in two to five
   annotations placed on the data with leader lines.
5. **Rules, not boxes.** Structure comes from a 1px rule above each module and consistent spacing. Raised surfaces,
   radius and shadow are only for things that float: popovers, drawers, tooltips, menus, toasts.
6. **One hero per view.** One number set large (sans, 54px), top of the view. Everything else is a supporting figure.
7. **Calm and precise, dense below the fold.** Generous space only around the headline and hero; modules and tables
   below are compact (the "data-dense dashboard" of UI/UX Pro Max). Nothing ornate: no gradients, glow, glass or
   decoration; the only texture is the faint dot grid on the black bands.

---

## 2. Colour

All tokens are CSS custom properties in `dashboard/src/styles/tokens.css`. Charts read the same variables at render time
through `readTheme()` (`charts/theme.ts`), so one token set drives HTML and canvas. **Never hard-code a hex in a view.**

Dark values apply under `:root[data-theme="dark"]`, and under `@media (prefers-color-scheme: dark)` unless the user
picked light. The app sets `data-theme` on `<html>` before the first render. Light is the default the jury sees.

### 2.1 Surfaces, ink and rules

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#EDE6D6` cream | `#0A0A0A` night | page and chart surface |
| `--raised` | `#F7F3EA` | `#151515` | popover, drawer, tooltip, input, pressed segment |
| `--hover` | `#E4DBC8` (paper-2) | `#1C1C1C` | hover wash, segmented track, neutral chip |
| `--band` (= `--rail`) | `#0A0A0A` | `#161513` | the black bands: rail and footer (in dark a shade above the night page, so the band still reads as a band) |
| `--band-2` / `--band-rule` | `#151515` / `#2B2B2B` | `#211F1C` / `#36332D` | hover / active surface and hairlines on a band |
| `--band-ink` / `--band-ink-2` | `#F2EDE3` chalk / `#A39D90` | same | text on a band (16.97:1 / 7.34:1) |
| `--band-dots` | `rgba(242,237,227,.07)` | `.06` | the faint dot grid on bands (14px pitch) |
| `--ink` | `#141414` | `#F2EDE3` | primary text, **history line**, hero numbers (14.82:1 / 16.97:1) |
| `--ink-2` | `#3F3A31` | `#CFC8BA` | secondary text, standfirst, table body (9.08:1 / 11.9:1) |
| `--ink-3` | `#5F5849` | `#A39D90` | muted text, axis labels, captions (5.67:1, 5.31 on the wash / 7.34:1) |
| `--ink-4` | `#8A8475` | `#6E685E` | **non-text marks only**: shipped hairline, benchmark bars, "Other" (3.00:1 / 3.59:1) |
| `--rule` | `#D3C9B4` | `#242424` | hairlines between rows and figures |
| `--rule-strong` | `#B3A892` | `#3A3833` | module rule, axis baseline (non-interactive structure) |
| `--control-edge` | `#857B67` | `#736C61` | borders of controls: chips, segmented tracks and pressed segments, presets, buttons, selects, stepper, "i" buttons, row toggles (3.36:1 on paper, 3.04 on the wash / 3.82:1 on night): WCAG 1.4.11 |
| `--grid` | `#DDD4C1` | `#1A1A1A` | chart gridlines (solid, 1px) |

**Bands re-scope the tokens.** Inside `.rail` and `.view-foot` (`styles/shell.css`) `--paper`, `--ink*`, `--rule*`,
`--hover`, `--raised`, `--accent`, `--focus`, `--link`, `--good`, `--crit`, `--warn` are redefined for chalk on black,
so any component placed in a band reads correctly without special cases.

### 2.2 Orange: the forecast

`#FF6A13` on cream is only 2.31:1, so on cream orange is a **fill** (with ink text on it) or a darker burnt orange.

| Token | Light | Dark | Role | Contrast |
|---|---|---|---|---|
| `--orange` | `#FF6A13` | `#FF6A13` | fills only on cream (band, markers, primary button, active marker); any use on black | 6.90:1 on night |
| `--on-orange` | `#141414` | `#141414` | text on an orange fill | 6.42:1 |
| `--accent` | `#C24E08` burnt | `#FF6A13` | **forecast line** and forecast marks on paper | 3.85:1 (3.60 on the wash) |
| `--accent-text` | `#A33F05` | `#FF7A2E` | orange as text (the FORECAST zone label, tooltip "Forecast" tag) | 5.16:1 (4.83 on the wash) |
| `--accent-strong` | `#8A3404` | `#FFA066` | P10–P90 whiskers, pressed | – |
| `--accent-wash` | `#EEE0CC` | `#1E120B` | forecast-window tint, selected table row | – |
| `--accent-band` | `rgba(255,106,19,.24)` | `rgba(255,106,19,.28)` | P10–P90 band fill | – |
| `--accent-edge` | `rgba(194,78,8,.55)` | `rgba(255,106,19,.6)` | P10 / P90 edge hairlines, dotted P50 | – |
| `--accent-tint` | `#F0C4A2` | `#6B3A1C` | de-emphasised forecast bars (non-leaders in a ranking) | – |
| `--focus` | `#C24E08` | `#FF6A13` | the focus ring (≥ 3:1 on its surface) | 3.85:1 / 6.90:1 |
| `--link` | `#141414` | `#F2EDE3` | links are **ink, underlined**; orange is not an interactive colour | – |

Rules:

- **Never orange text on cream** at `#FF6A13`. Text in orange uses `--accent-text`; lines and marks use `--accent`.
- **Orange stays scarce**: the forecast (line, band, wash, forecast bars, forecast column rule, range-strip tick,
  "our model" bar), the single active / selected marker (active rail item, selected table row inset), the primary
  action fill, the focus ring, and the brand's single 2px rule under the masthead. Nothing else: links, tabs, chips and
  segmented controls are ink with underline, outline or weight.
- **The primary button** (`.btn.primary`) is the one orange fill on a screen, with ink text.
- **When every mark is a forecast** (procurement's mean + buffer bars), the orange goes to what the chart is about (the
  buffer) and the rest recedes to `--accent-tint`; a chart that is a solid orange mass has no emphasis left.

### 2.3 Semantic colours (always with a word or an icon)

| Token | Light | Dark | Role | Contrast (light) |
|---|---|---|---|---|
| `--good` / `--good-wash` | `#067006` / `#DCE6CC` | `#2FBF4F` / `#10230F` | resolved, checks pass | 5.08:1 |
| `--warn` / `--warn-wash` / `--warn-mark` | `#7A5C00` / `#EADFB5` / `#A07A00` | `#E8C547` / `#2A240E` / `#E8C547` | caution, in review; **amber, distinct from the brand orange** | 5.03:1 / mark 3.20:1 |
| `--crit` / `--crit-wash` | `#B02E2E` / `#F0D6CF` | `#F06A5F` / `#2A1310` | act now, failed check, revenue at risk | 5.16:1 |
| `--loss` / `--loss-fill` | `#A8322D` / `rgba(160,40,40,.24)` | `#EE7B70` / `rgba(238,123,112,.28)` | lost sales (evaluative, so the red family) | 5.35:1 |
| `--scenario` | `#7862BF` violet | `#9482DB` | what-if scenario line (solid) | – |

Alert never reads as forecast: status and loss are red / green / amber, never orange; the warn amber (`#A07A00`, hue
95°) is far from the brand orange; every status colour ships with an icon (`WarnTriangle`, `CheckCircle`,
`CrossCircle`) or a word in a `StatusPill`.

### 2.4 Chart roles

| Role | Token | Mark |
|---|---|---|
| Unconstrained demand (history) | `--ink` | 2px line, round join |
| Shipped, where lower than demand | `--ink-4` | 1px line, only on months where the gap is above 0.4 % (plus neighbours) |
| Lost to stock-outs | `--loss-fill` | area between shipped and demand (history only) |
| Months with rebuilt cells | `--ink` ring on `--paper` | 8px hollow marker where rebuilt cells cluster (>1.5 % of cells at aggregate; every one for a single series) |
| Forecast (submitted) | `--accent` | 2px line joined to the last actual (orange columns for one series) |
| P10–P90 band | `--accent-band` + `--accent-edge` | stacked area + 1px edges, fanning out of the last actual (whiskers for one series) |
| P50 | `--accent-edge` | dotted 1px, only when it departs from the forecast by more than 1px; always in the tooltip |
| Forecast window | `--accent-wash` | wash from the last actual to the end |
| Last actual | `--ink` | solid 1px vertical rule, labelled "Oct 2026 · last actual" |
| Benchmark / another forecast | `--ink-3`, `--ink-4` | 1.5px **dashed 4/3** (dashes mean "another forecast"; never gridlines, never history) |
| What-if scenario | `--scenario` | 2px solid; base forecast stays orange; gap labelled at the end |
| Data error (anomaly: corrected, or units unknown and kept out of fitting) | `--cat-1` rose | 9px hollow diamond on the value with a 2px paper halo, **plus** a text annotation (`anomalyAnnotations`); drawn by `buildTimeline` itself |
| Real event (anomaly) | `--cat-7` jade | 9px filled triangle **plus** a text annotation; drawn by `buildTimeline` itself |

History and forecast stay distinguishable in greyscale: the divider rule, the wash, the FORECAST zone label and the
band carry it as well as the hue.

### 2.5 Categorical palette (no orange, no blue)

| Slot | Token | Family (fixed by family index) | Light | Dark |
|---|---|---|---|---|
| 1 | `--cat-1` | Brake & Safety Systems | rose `#B74B61` | `#D46E80` |
| 2 | `--cat-2` | Chassis & Structural | violet `#7862BF` | `#9482DB` |
| 3 | `--cat-3` | Electrical Assemblies | mustard `#8A7300` | `#AB9017` |
| 4 | `--cat-4` | Hydraulic Systems | plum `#A84F8E` | `#C670AB` |
| 5 | `--cat-5` | Powertrain Components | olive `#6B7F09` | `#889D37` |
| 6 | `--cat-6` | Precision Machined Parts | purple `#9358AC` | `#B078C9` |
| 7 | `--cat-7` | Thermal Management | jade `#04896A` | `#05AB86` |
| – | `--cat-other` | "Other" fold | `= --ink-4` | `= --ink-4` |

In TS: `theme.cat[0..6]` are slots 1–7 and `theme.cat[7]` is "Other". Orange is deliberately **not** in the array.

Chosen on 24 Nov 2026 by searching OKLCH hues that exclude orange / brown (30–80°), blue (225–275°) and the status
green, then validating every order with the dataviz skill's `validate_palette.js` (Machado 2009 CVD, OKLab ΔE×100) in
both themes. ALL PASS:

| Check | Light (on `#EDE6D6`) | Dark (on `#0A0A0A`) |
|---|---|---|
| Lightness band | L 0.43–0.77 | L 0.48–0.67 |
| Chroma floor | all ≥ 0.10 | all ≥ 0.10 |
| Worst adjacent CVD ΔE | 10.6 (jade ↔ purple, deutan) | 10.1 |
| Worst adjacent normal ΔE | 17.7 | 16.4 |
| Contrast vs surface | all ≥ 3:1 | all ≥ 3:1 |

Rules: colour follows the entity (filtering never repaints survivors); regions use slots 1–6 in region order and
channels 1–4, never in the same chart as families; more than 7 series fold into "Other" or become small multiples;
stacks are ordered by slot with a 2px surface gap. **Use categorical colour last**: usually one entity in ink (or
orange if it is the forecast) and the rest in `--ink-4`. **At most 4–5 colours on one screen** (dashboard-designer).

### 2.6 Sequential and diverging ramps

| Ramp | Tokens (1 = near zero) | Use | TS |
|---|---|---|---|
| Warm grey (history magnitudes) | `--hist-1 … --hist-7` | shortfall heatmap, zero-month calendar, issue × month strip, waterfall steps | `theme.hist[0..6]` |
| Orange (forecast magnitudes) | `--fc-1 … --fc-7` | forecast by family × month, procurement buffer heat | `theme.fcRamp[0..6]` |
| Diverging jade ↔ plum | `--div-1 … --div-9` | bias, correlation, change vs last year | `theme.diverging[0..8]` |

Diverging: `div-1` is strong **jade (negative pole, "under")**, `div-5` the warm neutral middle, `div-9` strong **plum
(positive pole, "over")**. Neither pole is orange, so a bias map never reads as forecast volume. Always print the
numeric ends and name the poles in words in the legend (`scaleLegend`). For ordinal use start at step 3.
(The old `--slate-n` / `--cobalt-n` aliases and `theme.slate` / `theme.cobalt` were removed once every view was restyled.)

### 2.7 Spacing, radius, elevation, z-index, motion, layout

| Group | Tokens |
|---|---|
| Spacing (design px × `--u`) | `--sp-2 4 6 8 10 12 14 16 20 24 30 40 48 56` (`var(--sp-14)`); use `gap`, not per-element margins |
| Fluid unit | `--u` = `clamp(1px, 1px + (100vw − 1600px) / 4800, 1.5px)`: exactly 1px up to a 1600px viewport, 1.07px at 1920, 1.2px at 2560, 1.47px at 3840. Type, spacing, rail, gutters and control sizes are written `calc(<design px> * var(--u))`, so nothing changes at 1440 and below (see [§4.1](#41-extra-large-screens)) |
| Layout | `--rail-w` 232 × u (212px ≤ 1180px, 200px ≤ 1100px) · `--measure` 1128px, growing to 1280 / 1520 / 1760 / 1960px at 1600 / 1920 / 2240 / 2560px and 1800 × u from 3200px · `--gutter` 40 × u (32 ≤ 1280, 24 ≤ 1100, 16 ≤ 900) · `--module-gap` 30 × u · `--col-gap` 48 × u |
| Radius | `--r-1` 3px (chips in text, rail item) · `--r-2` 6px (controls) · `--r-3` 10px (popover, drawer) · `--r-tt` 8px (tooltip) · `--r-pill` (pills, badges) |
| Elevation | flat (everything on the page) or `--shadow-pop` (floating only). **No shadow on modules.** |
| Z-index (only these) | `--z-sticky` 10 (filter bar) · `--z-pop` 20 (popovers, comboboxes, menus) · `--z-tooltip` 30 (skip link, tooltips) · `--z-overlay` 50 (drawer scrim, drawer, toasts) |
| Motion | `--ease` `cubic-bezier(.2,.7,.2,1)`, `--dur` 180ms, `--dur-fast` 150ms. Hover feedback is colour / opacity / box-shadow over 150ms (never a transform that shifts layout); popovers fade and rise 6px; drawers slide 24px; charts update in 300ms and dim to 60 % while busy; no load animation on numbers; continuous animation only for loading; `prefers-reduced-motion` disables all of it. |
| Borders | 1px everywhere: `--rule` between rows, `--rule-strong` above modules, `--control-edge` around controls, `--ink` above the figure strip when it marks where the numbers start (`heavy`). Selected tab: 2px ink underline. The masthead carries the single 2px `--orange` rule. |

The deprecated aliases (`--surface`, `--muted`, `--hair`, `--history`, `--demand`, `--accent-ink`, `--slate-*`,
`--cobalt-*` …) and `styles/legacy.css` were deleted in the integration pass: nothing uses them any more.

---

## 3. Typography

Self-hosted, SIL Open Font License 1.1, latin-subset woff2 in `dashboard/src/assets/fonts/`, `font-display: swap`. No
CDN request at runtime (Vite fingerprints and bundles them).

| Family | Token | Use | Fallback |
|---|---|---|---|
| **Source Serif 4** (variable opsz 8–60, wght 400–700) | `--font-serif` | **computed sentences only**: view headline, standfirst, the brief, drawer headline, recommended action. Never a number in a chart, figure, table or tooltip. | Source Serif Pro, Georgia, Times New Roman |
| **IBM Plex Sans** (variable 400–700) | `--font-sans` | interface and evidence: labels, every number, tables, charts | Helvetica Neue, Arial, system-ui |
| **IBM Plex Mono** 400 / 500 | `--font-mono` | **real codes only**: SKU IDs, Record_IDs, hashes, CLI commands, file paths. Never for numbers or flavour. | ui-monospace, Menlo, Consolas |

Scale (use the shorthand tokens: `font: var(--t-title)`). The sizes below are the design sizes at 1440px; every token
is `calc(<size> * var(--u))`, so above 1600px of viewport the whole scale grows smoothly (×1.07 at 1920, ×1.2 at 2560,
×1.47 at 3840) and a 4K screen at device scale 1 reads like a comfortable zoom. Canvas text follows the same factor
through `fz()` ([§6.1](#61-theme-and-helpers-chartsthemets)). Write any new size as `calc(N * var(--u))`, never bare px:

| Token | Size / line height · weight · family | Use |
|---|---|---|
| `--t-display` | 38/1.10 · 600 · serif, opsz 56, tracking −0.018em | view headline: 2 lines max, `text-wrap: balance`, max 24ch (`.headline.long` 32px / 30ch for > 46 characters) |
| `--t-hero` | 54/1.05 · 600 · sans, −0.025em | the one hero figure |
| `--t-figure` | 29/1.05 · 600 · sans, −0.015em | supporting figures |
| `--t-case` | 23/1.20 · 600 · serif, opsz 32 | drawer / case-file headline |
| `--t-lede` | 17.5/1.50 · 400 (600 for key numbers) · serif, opsz 18 | standfirst, max 70ch |
| `--t-title` | 17/1.35 · 600 · sans | module conclusion title |
| `--t-brief` | 15.5/1.55 · 400/600 · serif, opsz 16 | the brief, the recommended action |
| `--t-body` | 14/1.50 · 400 · sans | default UI text |
| `--t-small` | 13/1.50 · sans | dek (max 75ch), table body, chips |
| `--t-caption` | 12/1.45 · sans | figure context, annotations, footnotes |
| `--t-axis` | 11.5/1 · sans | axis ticks |
| `--t-eyebrow` | 11/1.3 · 600 · sans, UPPERCASE, +0.09em | **only** the rail group names and the FORECAST zone label (`.eyebrow`) |

- **Uppercase is reserved** for the four rail group names and the FORECAST zone label on charts. Everything else is
  sentence case: the brand subtitle, the masthead section, filter labels, brief lead-ins (12.5px 600 ink-2), drawer
  kickers (`.kicker`, 12.5px ink-3) and drawer sub-headings. Never put an eyebrow above a module title.
- **Numerals**: proportional on hero and figure values (`tabular-nums` makes "121" look loose); `tabular-nums` in
  tables, axis ticks, tooltips, the range strip and every column of numbers (`.num`).
- **Narrow screens** (≤ 700px): prose steps up to at least 16px (standfirst and brief 16px, deks and figure context
  14px); body line height stays 1.5; prose measure 65–75 characters.
- Utility classes: `.mono`, `.id` (mono 500), `.serif`, `.kicker`, `.caption`, `.ink-2`, `.muted`, `.visually-hidden`.

---

## 4. Layout and the shell

```
┌ rail 232 (black band) ┬──────────────────────────────────────────────────────────────────┐
│ ▮▮▮ Celeris            │ masthead (cream): view | section (i) [pill]  Units|USD  Orders|Latent ☾ Copy link │
│ Planning control tower ├══════════════════ 2px orange rule ═══════════════════════════════════════╡
│ ■ Actuals  Jan 2019 –  │ filter bar (sticky): Family▾ SKU▾ Region▾ Channel▾ Customer▾   3,093 series in view Reset │
│ ■ Forecast Nov 2026 –  ├──────────────────────────────────────────────────────────────────┤
│ OVERVIEW / WHAT …      │ .page (cream, max 1128 + gutters): lede 8|4 → modules, gap 30     │
│ ▌active item           │                                                                  │
│ ✓ quantile engine      ├──────────────────────────────────────────────────────────────────┤
│                        │ footer (black band): Data as of · Source · Pipeline run · Built   │
└────────────────────────┴──────────────────────────────────────────────────────────────────┘
```

- **Rail** (`components/shell/Rail.tsx`, black band with the dot grid): wordmark with the two-chalk-one-orange glyph;
  the colour key (chalk square "Actuals", orange square "Forecast", spans computed from the calendar); the table of
  contents in reading order with section markers (Overview = split chalk/orange, What happened = chalk, What will
  happen = orange, Act = outlined) and the live exception count; the active item marked by a 2px orange inset on a
  `--band-2` surface; the provenance footer (quantile self-check). Below 900px it collapses to a top bar with "Views".
- **Masthead** (`components/shell/Masthead.tsx`, cream): view name, section (sentence case), an "i" with the view's
  question (`VIEWS[].blurb` in `app/context.ts`), the provisional status pill **only while `meta.provisional`** (now
  false, so it is absent), the global lenses as quiet segmented controls, the theme toggle and Copy link (toast "Link
  copied"; icon-only below 1180px with an `aria-label`). Its bottom border is the single orange rule.
- **Filter bar** (`components/FilterBar.tsx`): five cascading chips in hierarchy order, each labelled for assistive
  tech ("Family filter: All"); each opens a combobox popover (search for SKU and Customer; the SKU list is ranked by
  last-12-month units with mono codes and volume bars; the customer note explains "customer at the time"). Right end:
  "**N** series in view" (live region) and Reset. Defaults to all. It writes the URL hash. Sticky above 700px.
  Keyboard: the popover follows the ARIA combobox pattern. Focus stays on one element (the search input, or the listbox
  when there is no search) and `aria-activedescendant` names the highlighted option, so the highlight, the focus ring and
  what Enter picks are always the same option; ↑ ↓, Home / End, Page Up / Down move it, Escape closes and returns focus
  to the chip, Tab closes. Options are `role="option"` elements, not tab stops.
- **Footer** (`components/shell/Footer.tsx`, black band, mounted by the shell on every view): data as of (last actual
  month, forecast window), source (bundle version, export command, package version, history cells, forecast rows),
  pipeline run (short SHA-256 of the forecast and submission files, final or provisional inputs), and when the bundle
  was built (the server's `Last-Modified` of `meta.json`). Views never render their own provenance footer; a view may
  add a method colophon (`aside.colophon`).
- **Skip link** "Skip to content" (first focusable element) jumps to `main#main`, which carries `scroll-margin-top`
  (and `html` a matching `scroll-padding-top`), so the headline lands below the sticky filter bar, not under it.
- **One content edge.** The page is centred in the main column (`margin-inline: auto`); the masthead, the filter bar and
  the footer pad their content to the same edge (`--edge` = max(gutter, (100 % − measure) / 2)), so "Copy link" and
  "N series in view" end where the content ends on any screen.
- **Page** (`main.page`): one grid column with `gap: 30px`. A view returns a fragment of top-level blocks (Lede,
  Modules, FigureStrip, column wrappers); never wrap them in a card.
- **Column helpers**: `.cols-7-5`, `.cols-5-7`, `.cols-4-8`, `.cols-2`, `.cols-3` (all `minmax(0, …)`, stack below
  1180px; `.cols-4-8` below 1100px), and `.stack` for a vertical group of modules inside a column.
- **Breakpoints, tested at 1440 / 1280 / 1024 / 768 / 375 px with no horizontal page scroll**: 1280 hides the masthead
  section; 1180 stacks columns, folds the figure strip to 2×2 and hides "Copy link"'s label; 1100 narrows the rail;
  900 collapses the rail into a top bar; ≤ 700 the lede and the figure strip come first (top three figures first),
  everything else stacks below, the filter bar stops being sticky, touch targets grow to 44px and prose to 16px;
  ≤ 640px chart annotations become a numbered list under the chart (with the numbers drawn on the plot) and the
  Overview timeline defaults to "Since <year>"; ≤ 480 bar-table columns marked `hideNarrow` drop out. Wide ledgers
  scroll inside their own `.table-wrap`. Above 1440: see §4.1.

### 4.1 Extra-large screens

Tested at 1920 × 1080, 2560 × 1440 and 3840 × 2160 (device scale 1) with no horizontal scroll, light and dark.

| Viewport | `--u` | Measure | Rail | What changes |
|---|---|---|---|---|
| ≤ 1600px | 1px | 1128px (1280 from 1600) | 232px | nothing: the 1440 design, pixel for pixel |
| 1920px | 1.07px | 1520px | 247px | page centred with ~75px either side; grids gain a column where it helps (the Overview brief, change table and top exceptions sit in three columns, `.ov-lower`; the inbox case file widens to 470 × u); charts grow (below) |
| 2240px | 1.13px | 1760px | 262px | as above |
| 2560px | 1.2px | 1960px | 278px | type and spacing ×1.2 |
| ≥ 3200px | 1.33–1.5px | 1800 × u (2640px at 3840) | 340px at 3840 | type and spacing ×1.47 at 3840: a 4K screen at scale 1 reads like the 1920 layout at a comfortable zoom |

- **Prose never widens**: the headline (24ch), standfirst (70ch), deks (75ch) and the brief keep their limits; the extra
  width goes to charts, tables and extra grid columns.
- **Charts grow with the screen** (`chartHeight` in `charts/theme.ts`): the shared timeline keeps its 1440 shape (about
  3.1 : 1), between its design height × the type scale and min(2.2 × design, 55 % of the viewport height), so it still
  sits under the headline on a 1080px-high screen; every other chart grows with the viewport (up to 1.6×), never below
  its design height × the type scale (rows of labels always fit) and never taller than 0.8 × its width. Canvas fonts,
  grid margins and annotation boxes scale with the same factor (`fz`, `fpx`).
- **Drawers** are sized in design px × `--u` and their right edge sits on the page's right edge, so on a 4K screen the
  lineage drawer opens beside the content it explains instead of 1,800px away at the monitor's edge.

Global state lives in the URL hash (`state/url.ts`): `#/<view>?fam=HYD&sku=HYD-004&reg=Europe&ch=…&cust=…&m=usd&lens=latent`.
Put in-view UI state there too with `setParam(patch, true)` (replace, no history entry), so every state is a link. The
overview uses `tl` (range preset), `ev=1` (event rug), `by` (breakdown tab); the inbox reads `case=<row>`; every view
opens the lineage drawer from `cell=<SKU>|<region>|<yyyy-mm>` (`encodeCell` / `decodeCell` in `components/Lineage.tsx`),
so a reload or a shared link reopens it on the same cell.

**Theme.** `theme=dark|light` in the hash wins (a shared link opens in the sender's theme), then the choice saved by the
toggle (`localStorage` `celeris-theme`), then the system preference. Toggling drops a `theme` carried in by a link.

---

## 5. Components

Import from the component files. (The `components/ui.tsx` barrel and the deprecated `Card`, `Kpi`, `TimelineLegend`
were deleted once every view was restyled.) All props are typed; the signatures below are exact.

### 5.1 The view header: `Lede` (`components/Figure.tsx`)

```ts
Lede({ headline: string; standfirst?: string | ReactNode; eyebrow?: ReactNode /* sentence-case kicker */; figure?: ReactNode;
       after?: ReactNode /* a short block under the standfirst: the Overview's three-line watch list */ })
```
Headline and standfirst on 8 columns, the hero figure on 4 behind a vertical `--rule-strong` hairline. A string
standfirst may carry `**bold**` markers for the key numbers (rendered by `Rich`). Both are computed ([§7](#7-headline-templates)).
SKU codes (`AAA-000`) in the headline and in `Rich` text are wrapped in a no-break span (`noBreakCodes`), so they never
split at the hyphen.

```tsx
<Lede
  headline={render(T.headline, facts).text}
  standfirst={render(T.standfirst, facts).text}
  figure={<HeroFigure label="Forecast, next 19 months" value={fmtNum(total)} unit="units"
            visual={<RangeStrip p10={p10} p90={p90} mid={total} reference={last19} refLabel="Last 19 months" format={fmtNum} />}
            context={<Delta value={chg} suffix="vs the last 19 months of demand" />} />}
/>
```

### 5.2 Figures (the KPI contract): `Figure`, `HeroFigure`, `FigureStrip` (`components/Figure.tsx`)

```ts
Figure({ label: ReactNode; value: ReactNode; unit?: ReactNode; visual?: ReactNode; context?: string | ReactNode;
         link?: { label: string; onClick?: () => void; href?: string }; info?: InfoProps; hero?: boolean; className?: string })
HeroFigure(props without hero)            // 54px value; one per view, inside the Lede
FigureStrip({ children: ReactNode; heavy?: boolean; columns?: number; ariaLabel?: string })   // default 4 columns
```
`columns` is a class (`n2`, `n3`, `n5`), so the responsive rules still apply: four or five figures fold to 2 × 2 at
1180px; a strip of two or three stays one row until 700px; everything is one column below 700px. A figure's value and
its unit are two unbreakable pieces that wrap as a pair, so a long unit moves to the next line instead of overflowing.
Contract: label → value with a thin unit → **one** inline visual chosen by job (`Sparkline` for trend, `Ladder` for
accuracy, `Meter` for progress, `RangeStrip` for uncertainty) → one line of context in plain words → an evidence link.
Links align across the strip (the link sits at `margin-top: auto`).

```tsx
<FigureStrip>
  <Figure label="Lost sales, 2019–2026" value={fmtInt(u)} unit="units" context={`**${fmtMoney(usd, 1)}** of demand never shipped`}
          link={{ label: "Stock-outs & lost sales", onClick: () => go("stockouts") }}
          info={{ what: "…", how: "…", source: "stockouts.json" }} />
  …
</FigureStrip>
```

Inline visuals:

```ts
RangeStrip({ p10: number; p90: number; mid: number; reference?: number; refLabel?: string; format: (v: number) => string; bandLabel?: string })
// band P10–P90 with edges, orange tick at `mid`, ink tick at `reference`; each label sits at the track end nearest its
// mark; in figures narrower than 290px the labels take a row each.
Ladder({ rows: { label: string; value: number; me?: boolean }[]; max?: number; format: (v: number) => string; foot?: ReactNode })
Sparkline({ history: ArrayLike<number|null>; forecast?: ArrayLike<number|null>; divider?: number; height?: number; ariaLabel: string; floor?: number })
// inline SVG; history ink, forecast orange (repeat the last actual as its first point), window washed from `divider`
Meter({ segments: { value: number; tone: "good" | "warn" | "crit" | "ink" | "accent" | "rest"; label?: string }[]; ariaLabel: string })
Delta({ value: number; digits?: number; suffix?: ReactNode })   // SVG triangle + "3.5%" in ink: a change of demand takes no status colour
Rich({ text: string })                                          // "**x**" -> <b>x</b>, no HTML injection; SKU codes no-break
noBreakCodes(text: string): ReactNode                           // wraps AAA-000 codes in <span class="nb">
```

### 5.3 Modules: `Module`, `Key`, `KeyMark`, `timelineKey` (`components/Module.tsx`)

```ts
Module({ title: ReactNode; dek?: ReactNode; tools?: ReactNode; info?: InfoProps; keyItems?: (KeyItem | "sep")[];
         foot?: ReactNode; heavy?: boolean; id?: string; className?: string; level?: 2 | 3; children?: ReactNode })
KeyItem = { kind: KeyKind; label: ReactNode; color?: string; title?: string }
KeyKind = "line" | "thin" | "dash" | "dot" | "box" | "band" | "ring" | "point" | "diamond" | "triangle" | "rule"
Key({ items: (KeyItem | "sep")[]; ariaLabel?: string })
KeyMark({ kind: KeyKind; color?: string })                       // a mark alone, for any legend
timelineKey({ latent?, fc?, band?, lost?, rebuilt?, columns?, extra?: KeyItem[];
              present?: { shipped: boolean; lost: boolean; rebuilt: boolean } /* markPresence(spec) */ }): (KeyItem | "sep")[]
```
Pass `present: markPresence(spec)` (charts/timeline.ts) so the key lists only marks drawn in the visible range (no
"Lost to stock-outs" on a "Since 2024" range without losses). `Key` renders the items in groups split at `"sep"`; the
divider is drawn in the gap before a group and clipped when the group wraps, so a wrapped key never starts a line with it.
Anatomy: 1px `--rule-strong` rule → 14px → **conclusion title** (sans 600 17) with tools on the right → 4px → dek (13px,
ink-3, what is plotted, units, scope) → 12px → inline key → evidence → footnote (12px ink-3). Tools order: range
presets / segmented, view toggles, table-twin toggle, then the "i". `"sep"` in a key separates the past group from the
future group. Colours in keys are tokens (`"var(--ink)"`, `"var(--accent)"`, `"var(--loss-fill)"`, `"var(--cat-3)"`).

```tsx
<Module title={render(T.timelineTitle, facts).text} dek={timelineDek(facts)}
        tools={<RangePresets value={range} options={rangePresets(m)} onChange={(v) => setParam({ tl: v === "all" ? null : v }, true)} />}
        info={{ what: "…", how: "…", source: "history.json, forecast.json" }}
        keyItems={timelineKey({ latent })}>
  <TimelineChart spec={spec} annotate={annotate} ariaLabel="…" footnote={p50Note} />
</Module>
```

### 5.4 Controls (`components/controls.tsx`)

```ts
Option<T> = { value: T; label: ReactNode; title?: string; count?: ReactNode; disabled?: boolean }
Segmented<T>({ value: T; options: Option<T>[]; onChange: (v: T) => void; ariaLabel: string; size?: "sm" | "md" })
RangePresets<T>({ value: T; options: Option<T>[]; onChange: (v: T) => void; ariaLabel?: string })
Tabs<T>({ value: T; options: Option<T>[]; onChange: (v: T) => void; ariaLabel: string; className?: string })
RuleChip({ children: ReactNode; title?: string })
StatusPill({ tone?: "neutral" | "warn" | "good" | "crit" | "forecast"; children: ReactNode; onClick?: () => void; title?: string; icon?: ReactNode })
Button({ variant?: "default" | "primary" | "quiet"; size?: "sm" | "md"; children } & ButtonHTMLAttributes)
LinkButton({ onClick: () => void; children: ReactNode; title?: string })      // an action inside prose
MoreLink({ onClick?: () => void; href?: string; children: ReactNode })      // underlined ink evidence link + ArrowRight icon
Select<T extends string | number>({ label: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id?: string; inline?: boolean })
Stepper({ value: number; min: number; max: number; onChange: (v: number) => void; label: string; format: (v: number) => ReactNode })
Stamp({ ok: boolean; children: ReactNode })                                   // a rule check: tick or cross + words; wrap in <div className="stamps">
CheckPill({ passed: boolean; severity: "error" | "warning" | "info" })        // Pass / Fail / Warning / Note pill with its icon
```
- **Select**: a native `<select>` with a visible sentence-case label, stacked (label above) or `inline` (label left);
  `.field` / `.select` in `components.css`, 44px tall below 700px.
- **Stepper**: "− 3 months +" (procurement lead time); the value is announced politely.
- **Segmented** sets a lens or mode (Units | USD, Open | All, New | In review | Resolved): grey track, the pressed
  segment raised with a ring, never ink-filled (the headline stays the darkest object on screen).
- **RangePresets** replace zoom sliders on timelines ("2019–2028 | Since 2024 | Forecast window").
- **Tabs** switch content inside a module (Region | Family | Channel): text tabs with a 2px ink underline.
- **RuleChip**: 3px radius on `--hover`, 11px, for exception rules and anomaly types.
- **StatusPill**: fully round, a dot plus the word (New = neutral, In review = warn, Resolved = good).
- All are keyboard reachable; Segmented, RangePresets and Tabs move with ← →.

### 5.5 Tables (`components/tables.tsx`)

**Bar table** (rankings and change, text-first):

```ts
BarTable<R>({ rows: R[]; cols: BarCol<R>[]; bar?: BarSpec<R>; onRow?: (r: R) => void; selected?: (r: R) => boolean;
              rowKey?: (r: R, i: number) => string | number; ariaLabel: string; total?: Record<string, ReactNode> })
BarCol<R> = { key: string; label: ReactNode; kind?: "label" | "text" | "num" | "id" | "bar";
              value?: (r: R) => number | string | null; render?: (r: R) => ReactNode; width?: string | number; title?: (r: R) => string }
BarSpec<R> = { value: (r: R) => number; tone?: "forecast" | "history" | "loss"; leader?: (r: R) => boolean; max?: number }
```
Exactly one column has `kind: "bar"`. Mixed signs draw a 1px ink-3 zero line at the centre; all-negative bars grow
leftwards from the right edge. The leader is orange (forecast, `--accent`) or ink (history), the rest tinted
(`--accent-tint`, `--hist-3`). Bars are 10px high with a 2px data-end radius.

```tsx
<BarTable ariaLabel="Change by region" rows={change.rows} rowKey={(r) => r.label} onRow={(r) => pick("region", r.idx)}
  bar={{ value: (r) => r.d, tone: "forecast", leader: (r) => r === change.leader }}
  cols={[{ key: "l", label: "Region", kind: "label", value: (r) => r.label, width: "30%" },
         { key: "s", label: "Share next 12", kind: "num", value: (r) => fmtPct(r.share), width: "18%" },
         { key: "b", label: "Change", kind: "bar" },
         { key: "d", label: "Units", kind: "num", value: (r) => fmtSigned(r.d), width: "15%" },
         { key: "p", label: "%", kind: "num", value: (r) => fmtSignedPct(r.pct), width: "14%" }]} />
```

**Ledger** (registers and inboxes) — the legacy `DataTable` API, re-skinned and extended:

```ts
DataTable<R>({ rows: R[]; cols: Column<R>[]; pageSize?: number; onRow?: (r: R) => void; selected?: (r: R) => boolean;
               csvName?: string; initialSort?: { key: string; desc: boolean }; empty?: string; ariaLabel?: string;
               expand?: (r: R) => ReactNode; expandLabel?: string; rowKey?: (r: R) => string | number })
Column<R> = { key: string; label: string; value: (r: R) => number | string | null; render?: (r: R) => ReactNode;
              num?: boolean; width?: number; wrap?: boolean; clamp?: boolean; id?: boolean; fc?: boolean }
InlineBar({ value: number; max: number; label: ReactNode; lead?: boolean; tone?: BarTone; width?: number })
toCsv(rows, cols): string;   download(name, text, type?)
```
Header 11.5px ink-3 over a `--rule-strong` line, ▾ / ▴ on the sorted column; rows 13px on `--rule` hairlines, no zebra,
hover wash; selected row = `--accent-wash` + 2px orange inset on the first cell (the one selected marker). `num` right-aligns with tabular
numerals; `id` sets Plex Mono 500; `clamp` clamps long text to 2 lines (full text in the title tooltip or the drawer);
`fc` heads a forecast column with a 2px orange rule (the colour grammar inside a table). Rows are focusable and Enter
opens. Every chart should have a table twin with the same columns as its CSV. **`expand`** adds a disclosure button
(`aria-expanded`, `aria-controls`, 24px, 44px on phones) in a first column; it opens a full-width detail row under the
row, so the full text a `clamp` cuts is reachable by keyboard and touch, not only by hover (the anomaly register shows
type, scope, period, reason, evidence, detection, action, confidence and impact there). `rowKey` keeps open rows across
sorting and paging. Never put a must-show text only in a `title` tooltip.

### 5.6 Floating surfaces (`components/overlays.tsx`)

```ts
Popover({ trigger: ReactNode; triggerClassName?: string; ariaLabel?: string; title?: string; align?: "left" | "right";
          width?: number; children: ReactNode | ((close: () => void) => ReactNode) })
Info({ what: ReactNode; how?: ReactNode; source?: string; align?: "left" | "right"; size?: "sm" | "md"; label?: string })   // the "i"; label defaults to "About this module" (the masthead's says "About this view")
Drawer({ title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode /* sentence-case kicker */; onClose: () => void; children: ReactNode;
         width?: number /* design px (default 640), scaled by --u */ })
toast(text: string)            // bottom-left, auto-dismiss after 4 s; <ToastHost/> is mounted once by the shell
useDismiss(open, close)        // ref for "close on outside click and Escape"
```
- Every module carries an `Info`: **what it shows · how it is computed · source file**. 340px, 12.5px.
- `Drawer` anatomy (case file, lineage): kicker ("Case 1 of 286, lost account", sentence case) → serif computed
  headline (`--t-case`) → identity line (`sub`) → in the body: three-figure strip → series chart → "Why it is flagged"
  (`h3`: sans 600 13px) → "Recommended action" in serif (`className="action"`) → facts `<dl className="facts">`
  → status segmented, note, actions. It slides from the right over a 30 % paper scrim; Escape closes; focus moves in
  and returns. It is a real modal dialog: `aria-labelledby` points at its headline, Tab and Shift+Tab cycle inside it
  and focus that lands behind the scrim is pulled back. Its right edge sits on the page's right edge (§4.1).

### 5.7 States (`components/states.tsx`)

```ts
Skeleton({ width?: number | string; height?: number; style?: CSSProperties })
SkeletonText({ lines?: number; height?: number; lastWidth?: string })     // placeholders at real line heights
SkeletonChart({ height?: number })                                         // empty axes: gridlines + baseline
Loading({ what: string; height?: number })                                 // keeps the frame; no spinner
Empty({ title?: ReactNode; children?: ReactNode; action?: ReactNode })     // what happened, what to do
ErrorState({ message: string; fix?: ReactNode })                           // names the cause and the fix (default: re-run the export)
Notice({ tone?: "warn" | "crit" | "good" | "info"; children: ReactNode })  // inline, inside a module; never a page banner
```
Later loads dim the previous render (`busy` on `EChart` / `TimelineChart`); never show a spinner over a chart. Empty
copy example: "No forecast rows for this selection: the account is lost, or the SKU ends before November 2026. Clear
the customer or SKU filter to widen the view."

### 5.8 Editorial blocks (CSS classes, see `Overview.tsx`)

- **The brief**: `<Module className="brief">` with `<ol><li><span className="tag"><i className="warn|crit"/>Risk</span><p>…</p></li></ol>`;
  lead-in labels, serif prose, a status dot only on the items that carry severity, each item ending in a `MoreLink`.
  Items come from `briefing()` in `insights/briefing.tsx` (`{ tag, tone?, body }`).
- **Rank list** (`ol.ranklist > li > button.row` with `.rk .who .amt .why`): the top exceptions, each opening its case.
- **Small multiples** (`div.multiples` with `button.multiple`: `h4`, `.stat`, chart; `--sm-cols` sets the columns;
  `.multiples-axis` closes the row): one per entity on a shared scale; 7 → 4 → 2 columns.
- **Colophon** (`footer.colophon`): sources, method notes, the submission stamp.

### 5.9 Icons (`components/icons.tsx`)

Inline SVG, `currentColor`, no dependency: `ChevronDown, Moon, Sun, LinkIcon, WarnTriangle, CheckCircle, CrossCircle,
Close, Search, Menu, ArrowRight, Download, Glyph, Trend, CopyIcon, MinusIcon, PlusIcon, PendingIcon` (all take `size`).
Icons are functional, never decoration.

---

## 6. Charts

### 6.1 Theme and helpers (`charts/theme.ts`)

`const { theme } = useApp()` gives the `Theme` read from the CSS tokens for the active theme; put `theme` in your
`useMemo` deps so charts re-render on the toggle. Fields: `paper raised hover ink ink2 ink3 ink4 rule ruleStrong grid
accent accentText accentStrong accentWash accentBand accentEdge accentTint loss lossFill good warn warnMark crit
scenario cat[8] hist[7] fcRamp[7] diverging[9] orange onOrange band bandInk bandInk2 shadowPop`. (The deprecated aliases
were removed with the last unconverted view.)

| Helper | Signature | What it gives |
|---|---|---|
| `baseOption` | `(t) => {...}` | Plex Sans, ink-3 text, `animation: false` on first paint, 300ms updates, aria on |
| `categoryAxis` | `(t, data, extra?)` | 1px rule-strong baseline, no ticks, no gridlines, ink-3 11.5px labels |
| `valueAxis` | `(t, { max?, min?, usd?, percent?, name? })` | zero baseline (or `min` for a signed axis: bias uses `min: −max`), 4 intervals to `max`, compact labels ("150K", "$12M", "40%", "−2%" with a true minus), solid 1px grid |
| `gridStd` | `(narrow?, extra?)` | `{left 46, right 92, top 30, bottom 30}` × the type scale (92px right margin for end labels); phones 34 / 58 |
| `fz`, `fpx`, `typeScale` | `fz(11.5)`, `fpx(92)`, `typeScale()` | canvas font sizes and px dimensions scaled like `--u` (1 up to 1600px; 1.2 at 2560; 1.47 at 3840). **Every `fontSize` in a chart option goes through `fz()`.** The shell re-reads the theme when the scale changes on resize |
| `chartHeight` | `(base, width, aspect?)` | the height a chart gets on the current screen (§4.1); EChart and TimelineChart call it |
| `niceMax` | `(v) => number` | smallest 1 / 1.2 / 1.6 / 2 / 2.4 / 3 / 4 / 5 / 6 / 8 × 10ᵏ ≥ v (quarters are round) |
| `axisTick` | `(v, usd?) => string` | "0", "7.5K", "150K", "$2.4B" with a true minus |
| `tooltipStyle` | `(t)` | floating surface: raised, 1px rule, 8px radius, `--shadow-pop`, confined |
| `axisTooltip` | `(t, (items) => html)` | axis trigger with a 1px ink-3 crosshair that snaps to the category |
| `ttHead` / `ttRow` / `ttNote` / `ttEnd` | `ttHead(title, "actual" \| "forecast" \| tag?)`, `ttRow(color, label, value, kind?)` | tooltip HTML: header with the ACTUAL / FORECAST tag; rows lead with the **value** (600, tabular) then the label; `kind` = `"line"` (default), `"dash"` (another forecast) or `"box"` (an area) |
| `esc` | `(s) => string` | escape data labels before they go into tooltip HTML |
| `onFill` | `(t, fill) => string` | the theme's ink or paper, whichever has the higher WCAG contrast on the fill (heatmap cells, bar labels; dark-theme extremes get dark text) |
| `barStyle`, `BAR_MAX` | `(color, horizontal?)`, `24` | 2px data-end radius, square baseline; bars at most 24px thick |
| `scaleLegend` | `(t, { min, max, colors, format, low?, high?, dimension? })` | numeric heatmap legend: printed end values, poles named in words |
| `readTheme`, `cssVar` | `(name)`, `(varName)` | read the tokens (the shell does this; views use `useApp().theme`) |

Every chart obeys: solid hairline gridlines, never dashed; **never a dual axis** (index to a common base, or use two
charts); y from zero for volumes (indexed charts state their base and draw a hairline at 100); bars ≤ 24px with a 2px
data-end radius; lines 2px primary, 1.5px small multiples, 1px secondary; markers ≥ 8px with a 2px paper ring; areas
are 20–30 % washes. A legend (key) is present for 2+ series; direct labels are selective, never a number on every point.

```ts
const option = useMemo(() => ({
  ...baseOption(t),
  grid: gridStd(),
  xAxis: categoryAxis(t, labels),
  yAxis: valueAxis(t, { max: niceMax(maxV * 1.1), usd }),
  tooltip: axisTooltip(t, (items) => ttHead(monthLong(m.months[i0 + items[0].dataIndex]), "actual") + ttRow(t.ink, "lost", fmtInt(v), "box") + ttEnd()),
  series: [{ type: "bar", data, barMaxWidth: BAR_MAX, itemStyle: barStyle(t.hist[3]) }],
}), [t, …]);
<EChart option={option} height={260} ariaLabel="Lost units by month, 2019–2026" />
```

### 6.2 `EChart` (`charts/EChart.tsx`)

```ts
EChart({ option: EChartsCoreOption; height: number /* design height at 1440 */; aspect?: number; fixedHeight?: boolean;
         onClick?: (e: ChartEvent) => void; onXClick?: (index: number) => void;
         xGrid?: number; ariaLabel: string; className?: string; busy?: boolean; onLayout?: (chart: ECharts) => void; children?: ReactNode })
```
`height` is the design height at 1440px. Above a 1600px viewport the chart grows through `chartHeight(height, width,
aspect)` (§4.1): with `aspect` it keeps about that width : height ratio, otherwise it grows with the viewport.
`fixedHeight` turns growth off (TimelineChart sizes itself and passes it).
Every chart gets an ECharts `aria` description from `ariaLabel`: state the finding there. Tree-shaken ECharts 6 (line, bar, scatter, heatmap, custom; grid, tooltip, markArea / Line / Point, visualMap, legend,
dataZoom, aria). `busy` dims the previous render to 60 %; `onLayout` fires after each setOption and resize (for overlays
using `convertToPixel`); `children` render over the canvas; with focus, ← → move the crosshair and Esc hides it. The
`height` includes the axis band.

### 6.3 The shared timeline (`charts/timeline.ts`, `charts/TimelineChart.tsx`)

Every view that shows history and forecast uses it. One continuous axis Jan 2019 – May 2028. Layers bottom to top:
forecast-window wash → lost-sales gap → P10–P90 band (starting at the last actual with zero width) → P10 / P90 edges →
shipped hairline (only where lower) → unconstrained demand (ink) → rebuilt-cell rings → forecast (orange, first point =
last actual) → last-actual rule → HTML annotations → end label.

```ts
TimelineChart({ spec: Omit<TimelineSpec, "narrow" | "height">; annotate?: (model: TimelineModel) => Annotation[];
                height?: number /* 360 */; ariaLabel: string; busy?: boolean; onXClick?: (absoluteMonth: number) => void;
                footnote?: (model: TimelineModel) => ReactNode;
                patch?: (option: EChartsCoreOption, model: TimelineModel) => EChartsCoreOption /* a view-only layer, memoised */ })

TimelineSpec = {
  m, theme, measure, lens, filters,
  hist?: { shipped, demand, imputed, cells, missing?, unknownDemand? },   // HistoryAgg fields; latent lens: pass h.latent as shipped and demand
  fc?:   { value, p10?, p50?, p90? },                                     // ForecastAgg fields (window months)
  anomalies?: TimelineAnomaly[];   lines?: TimelineLine[];               // extra lines: { name, data (nMonths), color, dashed?, width? }
  range?: "all" | "recent" | "window" | [first, last];   zoom?: [first, last] /* legacy */;
  showEvents?: boolean /* event rug */;   columns?: boolean /* one series */;   narrow?: boolean;   height?: number }

buildTimeline(spec) => TimelineModel { option, start, labels, yMax, frame, demand, shipped, fc, p10, p50, p90, p50Drawn, p50MaxRel, hasBand, latent }
rangePresets(m) => Option[]                      // computed labels "2019–2028", "Since 2024", "Forecast window"
rangeStart(m, preset) => number;  laneEvents(m, filters);  eventTitle(description)
timelineAnnotations({ spec, model, exceptions?, exceptionRows?, include? }) => Annotation[]
anomalyAnnotations(model, items: { month, value, cls, title, text, impact }[], max = 3) => Annotation[]   // marker + text
```

Behaviour you get for free: range presets (no slider); a zero baseline with headroom for annotations; the P50 dotted line
only when it departs by more than 1px (`p50Drawn`; use `p50MaxRel` in the footnote); **one series → `columns: true`**:
history as ink columns (shipped + lost stacked), forecast as orange columns with P10–P90 whiskers, the divider and
wash on the band edge; the latent lens swaps history and forecast to latent demand and drops the band (say so in the
dek); `unknownDemand` keeps ERP-blank cells out of the lost-sales gap; the tooltip lists demand, shipped, lost and
rebuilt cells in history and forecast, P90, P50, P10 in the window, plus any extra line. Also built in:

- **History-only charts** (no forecast and no extra line) end at the last actual with no divider, no wash and no
  end-label margin; columns charts carry no end label either, so their right margin shrinks to 24px (12px on phones).
- **Anomaly marks** in their roles (rose hollow diamond, jade triangle), drawn ON their value (never offset: on a y axis an
  offset reads as another value) with a 2px paper halo; a diamond and a triangle in the same month step 5px apart
  horizontally. Views pass `anomalies` and nothing else.
- **Phones**: below 640px the year labels thin to every second or third January (ticks stay yearly) and the story
  annotations become a numbered list under the chart.
- **`patch`** lets a view add one evidence layer without forking the component (the case file adds the "at risk if it
  returns" area this way). The width hook is `useElementWidth()` in `app/hooks.ts`: a callback ref, so it also measures
  an element that mounts after a loading state.
- The in-window event label is written in the active measure ("−5,420 units" or "−$4.62M of revenue").

Pass `hist.unknownDemand: h.unknownDemand` and `hist.missing: h.missing` whenever you have a `HistoryAgg`.

### 6.4 Annotations (`charts/Annotations.tsx`)

```ts
Annotation = { id: string; at: number /* category index in the chart's own data */; value: number; title: string; text?: string;
               anchor: "above" | "below" | "zone" | "end"; tone: "past" | "future"; align?: "left" | "right";
               priority?: number /* lower wins space */; leader?: boolean }
AnnotationFrame = { avoid: ArrayLike<number|null>[]; divider: number; dividerBetween?: boolean; n: number; yMin: number; yMax: number }
AnnotationLayer({ chart, items, frame, version, onListed? });   layoutAnnotations(chart, items, frame);   wrap(text, font, maxW)
```
Annotations are **generated from data, never typed**. The default generators in `timelineAnnotations`:

| Generator | Condition | Example output |
|---|---|---|
| disruption trough | a Disruption event in the filter, with its minimum < 85 % of the 6 months before | "COVID-19 lockdowns / Demand falls to 51.4K in Apr 2020" |
| widest gap | the month where (demand − shipped) / demand peaks, > 1 % | "Semiconductor shortage / Shipments held below demand, 2021–22" (named after a covering Supply Constraint event, else "Stock-outs") |
| rebuilt cells | the largest cluster of months with rebuilt or unknown cells | "ERP migration / 33 missing rows rebuilt; 330 cells with units unknown, kept out of fitting, Mar–May 2023" (one vocabulary with Data health and the anomaly monitor: missing rows are *rebuilt*; ERP blanks have *units unknown* and are *kept out of fitting*) |
| window event | the largest `window_event` group in `exceptions.json` for the selection | "Orion Driveline shutdown / −5,420 units, Jul–Aug 2027" |
| divider + zone | a forecast or extra line is shown | "Oct 2026 / last actual" and "FORECAST / 19 months" |
| end label | a forecast is shown (lines mode) | "153K / P10–P90 151K–155K" |

Placement: labels are measured and wrapped (title 12.5px 600 ink, text 12px ink-3, max 190px, all × the type scale so
the measured box matches the rendered label on large screens), then placed in empty
space above or below the lines (never over a line, another label or the divider), choosing the shortest leader; past
labels stay left of the divider; future labels start at the divider, capped at the window width. A 1px ink-3 leader
runs from a 3.5px dot (ink for the past, orange for the future, 2px paper ring) and stops at the label's edge when it
would cross it. At most five story labels per chart; below 640px only the zone and end labels remain and the rest
become a numbered list under the chart, with each number drawn on its point (`.anno-num`). Write your own generator returning `Annotation[]` for other charts and pass
it to `TimelineChart.annotate` (or use `AnnotationLayer` with `EChart.onLayout`).

### 6.5 Other chart forms

- **Bar tables** (rankings, change): HTML `BarTable`, not canvas.
- **Small multiples**: one per entity on a shared scale; prefer the **moving annual total** indexed to the last 12
  actual months = 100 with a hairline at 100; history ink, forecast orange, window washed, a dot at "year to Oct 2027";
  the header carries name, change and volume; clicking filters the page. (Overview `MiniMat` is the reference.)
- **Heatmaps**: warm grey (`t.hist`) for history, orange (`t.fcRamp`) for forecast, jade ↔ plum (`t.diverging`)
  for signed values; 2px paper gaps between cells (`itemStyle.borderColor: t.paper, borderWidth: 2`); a value label
  only where the cell fits, coloured with `onFill`; always a **numeric** scale legend with the poles named in words
  (`visualMap: scaleLegend(t, { min, max, colors, format, low: "under-forecast", high: "over-forecast" })`).
- **Waterfall** (forecast X-ray, row bridge): built as an HTML bar table (one row per step, the factor and the signed
  change printed on every row, a zero line, the forecast step's bar orange), so small steps stay readable; distinct
  start and end rows.
- **Gantt** (lifecycle): active span `--hist-4`, in-window part `--accent-tint`; ▲ launch, ■ EOL, ○ planned; the
  predecessor link a hairline; a "today" rule at the last actual.
- **Dot / dumbbell** for before → after comparisons (data health, accuracy by aggregation level).
- **Ranked bars** are `BarTable`s: sorted descending (natural order excepted), every value printed in its own column.
- **Anomalies** get a marker and a text annotation (`anomalyAnnotations`); never a marker alone.
- **No pie** with more than five segments (use a ranked bar); no radar; no dual axis.
- **Benchmarks** dashed 4/3 in ink-3 / ink-4; **scenarios** solid `--scenario`; **end labels** instead of legends for
  ≤ 4 lines.

---

## 7. Headline templates

Every view headline, standfirst and module title is computed by a deterministic template over facts for the current
selection. No language model, no typed number. The engine is `dashboard/src/insights/headlines.ts`; the reference set
is `insights/overview.ts`.

### 7.1 The pattern

```ts
// insights/<view>.ts
import { changePhrase, render, renderFirst, selectionWords, type Template } from "./headlines";

export interface StockoutFacts { sel: SelectionWords; lostUnits: number; lostUsd: number; topFamily: string | null }

export function stockoutFacts(...): StockoutFacts { /* pure arithmetic over the bundle for the selection */ }

export const STOCKOUT_TEMPLATES = {
  headline: {
    id: "stockouts.headline",
    when: (f) => f.lostUnits > 0 && f.topFamily !== null,          // the claim's condition
    text: (f) => `Stock-outs hid ${fmtInt(f.lostUnits)} units (${fmtMoney(f.lostUsd, 1)}) of demand; ${f.topFamily} lost the most`,
    fallback: (f) => (f.lostUnits > 0 ? `Stock-outs hid ${fmtInt(f.lostUnits)} units of demand` : "No stock-out touched this selection"),
  },
} satisfies Record<string, Template<StockoutFacts>>;

// in the view
const facts = useMemo(() => stockoutFacts(...), [deps]);
<Lede headline={render(STOCKOUT_TEMPLATES.headline, facts).text} … />
```

```ts
interface Template<F> { id: string; when?: (f: F) => boolean; text: (f: F) => string; fallback: (f: F) => string }
render(t, f) => { id, text, fallback: boolean }     // never throws: a failing builder falls back
renderFirst([t1, t2, t3], f)                        // first template whose condition holds; else the last one's fallback
```

Rules: facts are computed once per selection and are pure; templates only format; a template's `when` guards every
claim its sentence makes (a "drives a third" title needs a leader carrying 30–100 % of the change); the fallback is
descriptive and true for any data; strings may carry `**bold**` for the standfirst's key numbers.

### 7.2 Vocabulary helpers

| Helper | Output |
|---|---|
| `changeVerb(chg)` | < 1 % "holds steady"; 1–5 % "eases" / "edges up"; 5–15 % "falls" / "grows"; > 15 % "drops sharply" / "surges" |
| `changePhrase(chg)` | "eases 3.2%", "holds steady" (no number under 1 %) |
| `changeNoun(chg)`, `side(chg)` | "dip" / "growth"; "below" / "above" |
| `fractionWord(share)` | "half", "a third", "a quarter", "two thirds", "three quarters", "a fifth", else "41%" |
| `countWord(n, capital?)`, `plural(n, one, many?)`, `joinList(items)`, `cap(s)` | "Five", "series", "a, b and c" |
| `selectionWords(m, filters)` | `{ name: "Hydraulic Systems in Europe", demandSubject: "Demand for Hydraulic Systems in Europe", all, fixed }` (prepositions: for SKU/family, in region, through channel, from customer) |

Voice: active, plain, one claim per sentence, no adjective the data cannot support ("eases", not "plunges", for −3 %).

### 7.3 As-built overview templates (`insights/overview.ts`)

| Where | Template | Output for the default selection (final forecast) |
|---|---|---|
| Headline | `{subject} {changePhrase(chg19)} over the next 19 months`; subject is "Revenue" in USD | "Demand edges up 3.5% over the next 19 months" |
| Standfirst | `**{total} units** are forecast from {first} to {last}, against {last19} in the last 19 months of unconstrained demand{, and even the P90 stays below that line \| , and even the P10 stays above that line \| ; the P10–P90 range of … spans that line}.` | "**2.79M units** are forecast from November 2026 to May 2028, against 2.70M in the last 19 months of unconstrained demand, and even the P10 stays above that line." |
| Timeline title | `The next 12 months land {x}% {below\|above} the last 12{, and the {Month} trough repeats}` (or "match … to within 0.5%") | "The next 12 months land 4.3% above the last 12" |
| Change title (`renderFirst`) | 1 `{leader} drives {fraction} of the 12-month {dip\|growth}` (leader 30–100 % of the net) · 2 `Every {dim} {grows\|eases}; {leader} {adds\|loses} the most, {±x}` · 3 `{leader} moves most, {±x%}, against a net {±y%}` · fallback `Change by {dim}: the next 12 months against the last 12` | "Every region grows; Europe adds the most, +14.3K" |
| Change note | `The mix {barely moves\|shifts\|shifts markedly}: the largest share shift is {X}, {±0.34 pts}.` | "The mix barely moves: the largest share shift is North America, −0.34 pts." |
| Top exceptions | `{Five} series hold {sum} of the {total} at risk` | "Five series hold $9.4M of the $66.8M at risk" |
| Outlook | `Every {unit} eases; {worst} falls furthest, {x}%` · `Every {unit} grows; {best} leads, +{x}%` · `{n} of {N} {units} grow; {best} leads, +{x}%, and {worst} trails, {y}%` | "6 of 7 families grow; Precision Machined Parts leads, +11.4%, and Electrical Assemblies trails, −0.1%" |

### 7.4 As-built templates of the other views (`insights/<view>.ts`)

Every view follows §7.1: one `facts` function per selection, `Template`s with a descriptive fallback, `renderFirst`
where several claims compete. Default-selection outputs (final bundle):

| View (facts file) | Headline as built | Hero figure |
|---|---|---|
| Data health (`health.ts`) | "Every blocking check now passes; 47 failed on the raw files" (leads with the finding; fallback names the row bridge) | 108 of 116 checks passing, raw → cleaned dumbbell (61 → 108) |
| Demand explorer (`explorer.ts`) | "Ordering cycles explain 99.4% of zero months"; one series: "HYD-004 in Europe orders two months in every three"; lost account: "{series} has placed no order since {month}"; planned launch: "{series} launches in {month}, with no history of its own" | last-12-month demand with the ordering-cycle cells or the cycle mix |
| Anomaly monitor (`anomalies.ts`) | "78% of flagged cells were real business, not errors" | share of flagged cells that were real, split bar real / error |
| Stock-outs (`stockouts.ts`) | "Electrical Assemblies accounts for 75% of all lost sales" | 106,925 lost units with the lost / back-ordered split |
| Macro lead / lag (`macro.ts`) | "Vehicle orders leads Electrical Assemblies by two months (r = 0.93)" | 5 of 7 families with a stable driver |
| Forecast & accuracy (`accuracy.ts`) | "Our model beats seasonal naive by 12.3 points of WAPE" (selection-led when filtered); time machine "The forecast made in {origin} missed monthly totals by {x}; seasonal naive missed by {y}"; bias by horizon "Bias stays within ±{n}% at every horizon; the largest is {b} at {h}" | WAPE 26.3% on its benchmark ladder (4 origins, floor 23.6%) |
| Lifecycle (`lifecycle.ts`) | "Three SKUs hand over to successors in 2027" | successors' volume by May 2028 as a share of their predecessors' (48%) |
| What-if (`whatif.ts`) | "PMI −3 from Jan 2027 cuts the plan by 1.8%" | the scenario change (−50.1K units) on a strip against the base P10–P90 |
| Exception inbox (`inbox.ts`) | "285 series need a planner's judgement this cycle" (one series: "{series} needs …") | $66.78M at risk with the three-colour review meter |
| Case file (`inbox.ts`) | lost account "{customer} has placed no {sku} order since {month}"; EOL, cold start and year-on-year variants | at risk · units if it returns · window |
| Procurement (`procurement.ts`) | "Pooling {lead} months cuts the P90 safety stock by {x}%" | safety stock for the first cover (USD) against summing the monthly P90s |
| Data download (`downloads.ts`) | "Every number here traces to pipeline run {short hash}" | 23 of 23 files re-hashed in the browser |

---|---|---|
| Data health | "{raw} raw rows became {cells} clean grid cells; {pass_after} of {checks} checks now pass" | checks passing after cleaning (before → after dumbbell) |
| Demand explorer | "{selection}: {cycle summary}, {zero share} of zero months scheduled" ("HYD-004 in Europe orders every second month; all 39 zero months are scheduled") | last-12 volume with the ordering-cycle chip |
| Anomaly monitor | "{n} flagged points: {errors} data errors fixed, {events} real events kept" | share of flagged points that were real business |
| Stock-outs | "Stock-outs hid {lost} units ({usd}) of demand; {top family} lost the most" | lost USD |
| Macro lead / lag | "{indicator} leads {family} by {lag} months (r = {r})" (the strongest stable driver) | families with a stable driver |
| Forecast & accuracy | "The model beats seasonal naive by {x} pts of WAPE; {weakest segment} is its weakest segment"; time machine title "Forecast made in {origin} missed by {wape} over 19 months" | WAPE with its benchmark ladder |
| Lifecycle | "{n} SKUs end and {m} launch inside the window; every run-off reaches zero by its EOL" | net SKU count change |
| What-if | "{scenario} cuts the 19-month plan by {x}% ({units}); {family} feels it most" | the scenario change |
| Exception inbox | "{n} series need a planner's judgement this cycle"; standfirst "{total} of forecast-window revenue depends on them. {k} lost accounts carry {usd}, {p}% of it; the {event} shutdown touches the most series ({n}) but only {usd}." | revenue at risk with a three-colour review meter |
| Case file | lost account "{customer} has placed no {sku} order since {last order month}"; EOL "{sku} runs off to zero inside the window"; cold start "{sku} launches with no history of its own"; YoY "{sku}'s forecast moves sharply against last year" | at risk · units · window |
| Procurement | "Covering {lead} months at P{sl} needs {buffer} of safety stock ({usd}); pooling saves {saving} against summing monthly quantiles" | buffer in USD |
| Data download | "Every number here traces to pipeline run {short hash}" | files in the bundle, ✓ all checksums verified |

---

## 8. Numbers and copy

Use the helpers in `data/format.ts`; never `toFixed` in a view.

| Helper | Output |
|---|---|
| `fmtNum(x, mbDigits = 2)` | in full under 10,000 (`6,961`) · one decimal 10K–100K (`51.4K`) · none 100K–1M (`161K`) · M/B with two decimals (`2.79M`, `2.35B`) |
| `fmtMoney(x, mbDigits = 2)` | `$6,961`, `$51.4K`, `$2.50B`, `−$1.2M` (prose: `fmtMoney(x, 1)` → `$66.8M`) |
| `fmtValue(x, measure)`, `fmtValueUnit(x, measure)` | `2.79M` / `$2.50B`; `2.79M units` / `$2.50B` |
| `fmtSigned(x, measure?, mbDigits?)` | `+14.3K`, `−11.0K`, `+$3.4M` |
| `fmtInt`, `fmt1` | `106,925`; `110.8` |
| `fmtPct(x, d=1)`, `fmtPctAbs`, `fmtSignedPct`, `fmtPts(x, d)` | `28.1%`; `3.5%`; `+3.5%` / `−0.1%`; `−0.34 pts` |
| `monthName`, `monthLong`, `monthOnly(l, long?)`, `monthSpan(a, b)`, `yearSpan(a, b)` | `Oct 2026`; `October 2026`; `Oct` / `October`; `Mar–May 2023`, `Dec 2026 – Feb 2027`; `2021–22` |
| `MINUS` | U+2212 |
| `fmtOnScale(x, colMax, measure?, signed?)` | a value on its **column's** scale, so a table column never mixes `14.3K` with `9,479`: K (one decimal) when the column's largest magnitude is ≥ 10,000, M (two decimals) from a million; a value that prints as zero is `0` |
| `fmtFixed(x, digits)` | fixed decimals with a true minus for correlations and coefficients (`−0.65`) |
| `fmtBytes(n)` | `1.21 MB`, `71.2 kB` |

`fmtSignedPct`, `fmtPts` and `fmtSigned` never print a signed zero (`0.0%`, `0`, never `−0.0%`). The legacy `compact`,
`fmtUsd`, `fmtMeasure` and the `monthShort` alias were deleted.

Copy rules:

- A true minus (−), never a hyphen; thin units ("2.79M units", "$2.50B"); percentages with one decimal, two when the
  story is a tiny shift ("0.34 pts").
- Months "Oct 2026" in charts and tables, "October 2026" in serif prose, **never ISO (`2026-10`) in reading text**
  (ISO stays in CSV, the URL and code). Pipeline prose that contains ISO months goes through `readableMonths()`
  (`insights/briefing.tsx`).
- Sentence case; UPPERCASE only for the rail group names and the FORECAST zone label; no exclamation marks; no
  "simply", "just", "powerful"; no decorative copy, taglines or notes explaining the UI.
- **Middle dot** only between two fields of one identifier (`PTC-002 · North America`); elsewhere a comma or a line
  break. **Arrows** only as the `ArrowRight` icon on evidence links (`MoreLink`), never on buttons, never typed.
- **Mono** only for codes (SKU, Record_ID, hashes, commands, paths). Non-breaking space between a figure and its unit.
- Figures: label, value with its unit, a **comparison** (vs the last 19 months, a benchmark, a share of the total),
  one line of context in plain words, an evidence link ("Data health").
- Empty and error states say what happened and what to do; errors name the cause and the fix.
- Every number on screen comes from the bundle. If a number is not in the bundle, it does not go on screen.
- **A fact shown twice comes from one variable** (fix round, 25 Nov 2026). Shared fact helpers, not copies:
  `riskFact` / `actFact` / `lostShare` / `ladderFacts` (`insights/briefing.tsx`: the brief, the Overview watch list and
  figures), `repairFacts` (`insights/health.ts`: Overview, Data health, the anomaly monitor's "units unknown"),
  `lostFacts` / `lastOrderPhrase` / `reasonRow` / `reasonShort` / `reasonFull` (`insights/inbox.ts`: inbox rows, case file,
  brief, Overview top five), `bestBenchmark` / `ptsBetween` / `shares100` (`insights/accuracy.ts`).
- **Differences of printed numbers are taken from the printed numbers**: round each value to its shown precision first,
  then subtract (`ptsBetween`), so "+13.0 pts" always equals 51.6 − 38.6. Rates change in **points**, levels in **%**
  (PMI 52.4 to 50.3 is "−2.1 pts", never "−4.0 %"). Parts that are shown with a total add up to it (largest-remainder
  rounding: `roundToTotal`, `roundParts`, `shares100`) or carry a rounding note.
- **Name the base and the statistic**: "47 of the 90 blocking checks", "r = 0.93 over 2019–26", "4.8 pts better than
  cycle-aware naive, the best benchmark". A single-series headline compares with the best benchmark for that series.
- **One word per thing**: *cases* (the inbox, the rail badge, the brief, the watch list), *last order May 2025; silent 17
  months* (never "since June"), *repaired* = corrected + rebuilt + units unknown (a partition of history cells),
  *rebuilt* (missing rows) vs *units unknown, kept out of fitting* (ERP blanks), *in-hindsight floor* (never "noise
  floor").

---

## 9. Accessibility

- **Contrast** (measured, [§2](#2-colour)): text uses `--ink`, `--ink-2`, `--ink-3` (≥ 5.3:1 on paper and on the
  forecast wash, ≥ 7.3:1 on night), `--accent-text` for orange text (≥ 4.8:1), `--loss` / `--crit` / `--good` / `--warn`
  for status words (≥ 5.0:1). `--ink-4` and `--orange` on cream are for marks and fills only (3.0:1 and 2.3:1); text
  on an orange fill is ink (6.42:1).
- **Colour is never alone**: status pills carry a word, warn/crit dots carry a visually hidden label, anomaly types are
  double-encoded by shape (diamond / triangle), the past/future split is also a rule and a wash, forecast columns in
  tables are headed by an orange rule *and* sit right of the history.
- **Focus**: a 2px `--focus` outline (burnt orange on cream, orange on black) with 2px offset on every interactive
  element (`:focus-visible`). Table rows,
  small multiples and rank rows are buttons or focusable rows; Enter opens.
- **Non-text contrast**: control borders use `--control-edge` (≥ 3:1 on paper, the wash and night); the focus ring and
  the forecast line are ≥ 3:1; `--rule-strong` (1.9:1) is only for structure that is not a control.
- **Keyboard**: Segmented, RangePresets and Tabs move with ← → (roving tabindex); filter comboboxes follow the ARIA
  combobox pattern (`aria-activedescendant`, one highlight = the focus ring = what Enter picks; ↓ opens, ↑ ↓ Home End
  move, Enter chooses, Escape closes back to the chip); popovers and drawers close with Escape; drawers trap Tab and are
  named by their headline (`aria-labelledby`); register rows expand with a disclosure button; charts take focus and move
  the crosshair with ← →. Hit areas are at least 24px at every width (the small "i" carries an invisible 3px halo) and
  44px below 700px.
- **Charts**: every `EChart` has `role="img"` and an `ariaLabel` that states what is plotted (the overview uses the
  computed title and dek); every chart should have a table twin (the same columns as its CSV); the annotation overlay is
  `aria-hidden` because the numbered list / tooltip / table carry the same facts.
- **Semantics**: one `h1` per view (the headline); modules are `section`s labelled by their `h2`; the rail is a `nav`,
  the filter bar a `search` landmark; live regions for the series count and toasts.
- **Motion**: `prefers-reduced-motion` removes all transitions and animations.
- **Print**: rail, masthead, filter bar and tools are hidden; colours print exactly; modules avoid page breaks.

---

## 10. Do and don't

| Do | Don't |
|---|---|
| Open every view with `Lede`: computed headline, standfirst, one `HeroFigure` | Start a view with a row of equal KPI tiles |
| Separate modules with the `Module` rule and 30px of space | Put modules in cards with borders, radius or shadow |
| Write titles as computed conclusions with a descriptive fallback | Type a number into a title, or describe the chart ("Mix shift") |
| Draw history in ink, the forecast in orange (`--accent` on cream), the band in `--accent-band` | Use orange for a category, a status, a link or decoration; use blue at all |
| Use `TimelineChart` for any history-into-forecast chart | Build a second timeline with its own colours and a zoom slider |
| Annotate 2–5 facts on the data; keep a short inline key | Ship a 7-item legend or a number on every point |
| Use warm grey for history magnitudes, orange for forecast magnitudes, jade ↔ plum for signed values | Use a rainbow, or orange for a bias map |
| Emphasise one entity and grey the rest (`--ink-4`) | Paint eight categorical hues when the story is one line |
| Use `Segmented` for lenses, `Tabs` for content, `RangePresets` for time | Fill a segmented control with ink |
| Format with `data/format.ts`; months as "Oct 2026" | Show ISO months, hyphen-minus or `toFixed` output |
| Keep in-view state in the URL with `setParam(patch, true)` | Keep shareable state in component memory only |
| Put view-only CSS in `views/<View>.css` (or the view group's `views/g1|g2|g3/*.css`), imported by every view that uses it | Rely on another module to import your stylesheet, or hard-code colours inline |
| Dim the previous render while loading (`busy`) | Show a spinner over a chart or a skeleton flash on refetch |

---

## 11. Restyling a view: checklist and per-view notes

### 11.1 Checklist

1. Create `insights/<view>.ts`: a `facts` function and `Template`s with fallbacks (headline, standfirst, module titles).
2. Replace the top of the view with `<Lede headline standfirst figure={<HeroFigure … />} />`.
3. Replace `Card` with `Module` (title = computed conclusion, `dek`, `info`, `keyItems`, `tools`, `foot`).
4. Replace `Kpi` rows with `FigureStrip` + `Figure` (one inline visual each, context, evidence link).
5. Replace timelines with `<TimelineChart spec={…} annotate={…} />` inside a `Module` with `keyItems={timelineKey(…)}`
   and `RangePresets`; pass `missing` and `unknownDemand`.
6. Restyle other charts with `baseOption`, `categoryAxis`, `valueAxis`, `gridStd`, `axisTooltip` + `ttHead/ttRow`,
   `barStyle`; colours from `theme` roles and ramps; legends as `Key`.
7. Tables: rankings → `BarTable`; registers → `DataTable` with `num`, `id`, `clamp`, `fc`; ISO months → `monthName`.
8. Chips/badges → `RuleChip` / `StatusPill`; toggles → `Segmented` / `Tabs`; in-view state → URL via `setParam(…, true)`.
9. Loading → `Loading` / `SkeletonChart`; errors → `ErrorState`; empty → `Empty` with what to do.
10. Use only tokens and theme roles (the deprecated aliases and `legacy.css` no longer exist); import every stylesheet
    the view uses directly in the view.
11. `npm run build`, then screenshot light and dark at 1440×900 and 1280×720, one filtered state and one single series;
    check no overlapping or clipped text and that every number comes from the bundle.

### 11.2 Per-view notes (as built; the original specification with the integration changes)

Integration changes on top of the original notes: Data health's checks ledger and the anomaly register print pipeline
prose through `readableMonths` (ISO months, "->", "x10" and hyphen-minus made readable); Forecast & accuracy adds
**bias by horizon** (a WAPE | Bias toggle on the horizon chart, `hm=bias`), names the challengers (global GBM,
ensemble) under the value-added steps, renders the X-ray as a waterfall bar table and calibration as HTML 100 % bars;
Lifecycle uses a grouped Gantt plus one handover panel per predecessor → successor; Procurement puts the orange on the
buffer and the tint on the mean; the inbox's cause tabs count cases (the headline counts series).

Every view: masthead, filter bar, then a lede (headline and standfirst on 8 columns, the hero figure on 4), then modules.

- **Data health** (history). Modules: row waterfall (horizontal warm grey, 248,248 raw rows → 245,548 grid cells, each step
  labelled with its rule, the final bar ink); rows affected by rule (bar table coloured by recovery method, categorical
  slots 1–3 with a key, sorted by rows); issue × month heat strip (warm grey with a numeric legend, ERP months annotated); every check before and
  after (ledger with ✓ pass / ✕ fail pills and tabular metrics); duplicates and restatements (ledger, mono Record_IDs);
  numeric-state census (small bar table). A check row opens the lineage drawer filtered to that rule.
- **Demand explorer** (history). Left 4 columns: navigator (breadcrumb "All › Hydraulic Systems › HYD-004", search,
  ranked list with mono codes, two-line descriptions, volume bar and share; drills family → SKU → region → customer).
  Right 8 columns: the timeline (columns for a single series; "continue into forecast" on by default). Below:
  seasonality (current year ink, other years `--ink-4` hairlines, average dashed, labels on current year and average
  only); zero-month calendar (scheduled zero = `--hist-2` with a dot, unexplained = crit-wash with a cross icon, non-zero = warm-grey
  magnitude, tooltip with the reason); series card (`dl`: ordering cycle and changes, customers over time as a mini
  Gantt, demand class, stock-outs, fixes). Clicking a month opens the lineage drawer.
- **Anomaly monitor** (history). The timeline with anomaly marks (rose hollow diamonds = errors fixed, jade triangles =
  real events, key inline); counts by type (bar table); the register (ledger: type chip, reason clamped to 2 lines,
  action, a 4px warm-grey confidence meter, impact; group by cause; CSV). A row opens the series in the explorer with the
  lineage drawer.
- **Stock-outs & lost sales** (history). Shipped versus unconstrained timeline with the loss gap; lost versus
  back-ordered by month (lost = `--loss-fill` with a solid edge, back-ordered = `--hist-4`, each labelled once); shortfall
  heatmap family × month (warm grey with a numeric legend; semiconductor months annotated); lost USD by year / family / region / reason (tabbed
  bar table, `tone: "loss"`); back-order mechanics (small ledger); largest lost-sales series (ledger → explorer).
- **Macro lead / lag** (history). Family × indicator matrix (diverging jade ↔ plum, ★ on the model's drivers at
  their lag, r printed where it fits); lag profile by era (small multiples, eras as ink shades, chosen lag dotted);
  model-free check (indicator shifted by its lag against demand, **indexed to 100 on one axis**, never dual-axis);
  indicator paths into the window with repaired cells as rings; EV shift by powertrain; per-SKU sensitivities as a dot
  plot.
- **Forecast & accuracy** (prediction). The timeline plus the time machine (segmented "Live | as of …"; the backtest
  forecast in orange with its own wash, actuals in ink continuing through, seasonal naive dashed ink-3); forecast table
  (month / quarter / year tabs with quantiles; forecast columns headed by the orange rule; a ✓ stamp "Bundle =
  submission.csv (2,793,254 units, 58,219 rows)"); forecast X-ray waterfall with a month selector; forecast value added
  (bar table naive → seasonal naive → cycle-aware → final, the noise floor as a labelled vertical hairline); WAPE by
  horizon (lines with end labels; final orange, baselines dashed ink-3 / ink-4); bias family × region (diverging,
  click filters); interval calibration (100 % bars below P10 / inside / above P90 with target ticks 10 / 80 / 10);
  accuracy by aggregation level (dumbbell naive → final).
- **Lifecycle** (prediction). Gantt of launches, EOL-announced, discontinued and planned SKUs by family with a "today"
  rule; run-offs to zero (small multiples ending in ■ at EOL, ✓ when the forecast is 0 after EOL); cold starts versus
  predecessor (predecessor history ink, the new SKU's forecast orange, aligned on launch month); recent launches still
  ramping.
- **What-if** (prediction). Left 4 columns: scenario builder (preset chips, indicator, shift slider, start and end,
  "remove window events" checkboxes, an orange-filled primary Apply with ink text). Right 8: the timeline with the base forecast (orange) and the
  scenario (`--scenario`, solid), the difference labelled at the end. Below: change in P90 cover, impact by family
  (diverging bar table). The scenario goes into the hash.
- **Exception inbox** (act). Hero: revenue at risk with a three-colour review meter (resolved / in review / new). Cause
  tabs (seven equal columns: All + six rules, each with name, $ at risk, count and a 3px bar; the selected one carries an
  ink overline). Work area: the ranked ledger (#, mono series with description, rule chip with a two-line why, at risk
  with bar, status pill; group by cause; Open | All) and the docked case file (`Drawer` anatomy; for lost accounts the
  series as columns, the pre-loss level as a dashed crit line and the "at risk if it returns" area washed in crit across
  the window). Status and notes stay in the browser. `case=<row>` in the hash opens a case (the overview uses it).
- **Procurement plan** (act). Tools: service level segmented (P80 | P90 | P95 | P97.5) and a lead-time stepper. Mean
  plus buffer by month (orange mean, `--accent-tint` buffer stacked with a 2px gap); aggregate versus naive sum of quantiles
  (two bars with a risk-pooling annotation); buffer by SKU (bar table in units and USD); footnote "Gross requirements
  only: no inventory positions are provided."
- **Data download** (act). Extracts of the current selection (four rows with row count, size and "Build CSV"); bundle
  manifest (ledger: mono path, size, truncated SHA-256 with copy; a final / provisional pill per modelling input);
  pipeline hashes.

---

## 12. File map

```
dashboard/src/
  styles.css                 entry: imports the four files below in order
  styles/tokens.css          @font-face, every token, light + dark            (edit only to add a token)
  styles/base.css            element defaults, utilities, native input accents, focus, reduced motion, print
  styles/shell.css           rail, masthead, filter bar, page grid, column helpers, breakpoints
  styles/components.css      lede, figures, modules, keys, annotations, controls, fields, tables, tooltips, overlays,
                             states, brief, rank list, multiples, drawers (trio, lineage blocks)
  assets/fonts/              Source Serif 4, IBM Plex Sans (variable), IBM Plex Mono 400 / 500 (woff2, OFL)
  app/context.ts             AppState (useApp), VIEWS (titles, rail labels, blurbs), GROUPS (sections, masthead section names, markers)
  app/hooks.ts               useSelection(): segs, runs, series, single, h (HistoryAgg), fc (ForecastAgg); useElementWidth(); useMedia()
  charts/theme.ts            readTheme, Theme, axis / grid / tooltip / bar helpers
  charts/EChart.tsx          the ECharts wrapper
  charts/timeline.ts         buildTimeline, presets, annotation generators
  charts/TimelineChart.tsx   <TimelineChart>: option (+ optional patch) + annotation overlay + narrow mode + footnote
  charts/Annotations.tsx     the annotation layout engine and overlay
  components/Figure.tsx      Lede, HeroFigure, Figure, FigureStrip, RangeStrip, Ladder, Sparkline, Meter, Delta, Rich, noBreakCodes
  components/Module.tsx      Module, Key, KeyMark, timelineKey
  components/controls.tsx    Segmented, RangePresets, Tabs, RuleChip, StatusPill, Button, LinkButton, MoreLink, Select, Stepper, Stamp, CheckPill
  components/tables.tsx      BarTable, BarTrack, InlineBar, DataTable, toCsv, download
  components/overlays.tsx    Popover, Info, Drawer, toast, ToastHost, useDismiss
  components/states.tsx      Skeleton, SkeletonText, SkeletonChart, Loading, Empty, ErrorState, Notice
  components/icons.tsx       inline SVG icons
  components/shell/          Rail.tsx, Masthead.tsx, Footer.tsx (provenance band on every view)
  components/FilterBar.tsx   the five cascading filter chips
  components/Lineage.tsx     the cell lineage drawer; encodeCell / decodeCell / cellOfExample (the `cell=` URL parameter)
  data/format.ts             number, percentage and month formatting
  data/breakdown.ts          monthly sums by family / region / channel for a selection; shares last 12 vs next 12
  data/aggregate.ts          HistoryAgg (incl. unknownDemand), ForecastAgg, forecastLatent, sum
  data/quantiles.ts          the aggregate-quantile engine (with cv_common) and the start-up self-check
  insights/headlines.ts      the template engine and vocabulary
  insights/overview.ts       the overview's facts and templates (reference)
  insights/<view>.ts         health, explorer, anomalies, stockouts, macro, accuracy, lifecycle, whatif, inbox,
                             procurement, downloads (+ indicators): each view's facts and templates
  insights/briefing.tsx      the brief (BriefItem { tag, tone?, body }), ladderFacts, exceptionRowsIn, readableMonths, largestShift
  views/Overview.tsx (+ Overview.css)   the reference view
  views/<View>.tsx           the other eleven views
  views/g1/                  parts.tsx (Dumbbell, SplitBar, ConfMeter) and g1.css: Data health, Explorer, Anomalies, Stock-outs
  views/g2/                  parts.tsx (FvaSteps, CalBars, Dumbbell, ScenarioStrip), XRay.tsx, forecast / macro / lifecycle
                             chart builders and g2.css: Macro, Forecast, Lifecycle, What-if
  views/g3/                  CaseFile.tsx, ui.tsx (HashCell, CheckMark) and inbox / procurement / downloads / g3 CSS
```

Dependencies are unchanged: React 19, ECharts 6, Vite 7, TypeScript 5.9. No UI or CSS framework, no icon package, no
font CDN.

---

## 13. Acceptance gates: every view, before it ships

Tick both gates against screenshots (light and dark at 1440×900 and 1280×720, plus 1024, 768 and 375 px, one filtered
state and one single series) **and at 1920×1080, 2560×1440 and 3840×2160 (device scale 1)**, the team owner's
extra-large-screen requirement: content centred with the bars on its edge, type comfortable, charts in proportion, no
empty half-screen. The UI/UX Pro Max gate comes first. A view that fails an item does not ship. Record what was
measured, not what was intended: the results, view by view, are in [`docs/design_gate_results.md`](design_gate_results.md)
(the first integration pass claimed passes that two reviews disproved; the fix round re-ran every item).

### 13.1 UI/UX Pro Max gate (18 points; skill `ui-ux-pro-max`, notes in `research/dashboard-skill-ui-ux-pro-max.md`)

Accessibility (critical)
1. Text contrast at least 4.5:1 in light and dark; no grey text on grey.
2. Visible focus ring on every interactive element; outline never removed without a replacement.
3. Everything reachable by keyboard; tab order follows visual order; no keyboard traps; a "skip to main content" link.
4. Icon-only buttons have `aria-label`; decorative icons are `aria-hidden`; form controls (the filters) have labels.
5. Semantic elements (`button`, `a`, `label`, `table`, `nav`, `main`) before ARIA roles; async updates announced with `aria-live="polite"`.
6. Each chart has a text alternative: a title that states the finding, an accessible description, and its data available as a table or download.

Interaction (critical)
7. `cursor: pointer` on everything clickable; hover feedback by colour or opacity in 150–300 ms, never a transform that shifts layout.
8. Click or tap for primary actions, not hover-only; touch targets at least 44 × 44 px on narrow screens.
9. Loading shows a skeleton or spinner, never a frozen screen; space is reserved so content does not jump.
10. Empty states show a helpful message and a next action; errors appear next to the problem.
11. The active view is highlighted in the navigation; the URL reflects view, filters and toggles (deep linking).

Layout and responsive (high)
12. Works at 1440, 1024, 768 and 375 px: no horizontal page scroll; wide tables scroll inside their own container or collapse to cards.
13. A defined z-index scale (10 / 20 / 30 / 50); popovers, drawers and sticky bars never fight.
14. Body line height 1.5–1.75; prose line length 65–75 characters; body text at least 16 px on narrow screens.

Motion and performance (medium)
15. `prefers-reduced-motion` respected; continuous animation only for loading; animate `transform` / `opacity`, not size.
16. Views are lazy-loaded; heavy lists are not re-rendered needlessly; no layout shift when data arrives.

Style and charts
17. One style across all twelve views; SVG icons only; nothing ornate.
18. Chart form matches the data; actual versus forecast distinguishable at a glance; anomalies marked and annotated; bars sorted with value labels; heatmaps with a numeric legend.

How the shared layer already covers it: tokens and focus ring (1, 2); skip link, roving tabindex, Escape-closable
popovers and drawers (3); `aria-label` on icon buttons, `aria-hidden` icons, labelled filter chips (4); `nav`,
`main`, `button`, `table`, live regions on the headline and the series count (5); `EChart` aria description,
computed titles, `DataTable` CSV (6); global hover transitions and pointer cursors (7); 44px targets ≤ 700px (8);
`LoadingFrame`, `Skeleton*`, `busy` dimming (9); `Empty`, `ErrorState`, `Notice` (10); rail active marker and URL
state (11); breakpoints and `.table-wrap` (12); `--z-*` tokens (13); type tokens (14); reduced-motion block (15);
lazy views and memoised options (16); one component set and `icons.tsx` (17); `TimelineChart`, `barLabel`,
`scaleLegend`, `waterfallLabel`, `anomalyAnnotations` (18). Each view still has to use them.

### 13.2 dashboard-designer gate (16 points; skill `dashboard-designer`, notes in `research/dashboard-design-skills.md` §9)

1. Passes the **5-second test**: after five seconds a stranger can say what the most important thing on the view is.
2. The view's decision and audience are obvious from its headline.
3. The Executive overview has 3–5 headline figures; no view shows more than 8 charts on one screen (a small-multiple
   set counts as one chart).
4. The hero figure is top-left / top and visibly the largest element.
5. Every headline figure has a comparison value and a unit.
6. Every chart title states the insight.
7. No more than 4–5 colours on screen; grey / ink is the default; colour is consistent with every other view.
8. Red / green / amber appear only for status, and never as the only cue.
9. The date range is labelled on every time chart (in the dek or on the axis); history and forecast are distinguishable at a glance.
10. Filters are at the top and default to "all".
11. Numbers are formatted with sensible precision and units.
12. Data source and "data as of" are visible in the footer (the shared `ViewFooter` does this).
13. White space is about 15–20 %: neither cramped nor half-empty.
14. Data is labelled directly where possible; no legend-hunting; no pie with more than five segments.
15. Usable at 768 px (stacked) and not broken at 390 px; the top three figures come first on narrow screens.
16. Contrast is at least 4.5:1 and the palette is colour-blind safe in both light and dark themes.

### 13.3 Also apply

The 30-item QA checklist in `research/dashboard-design-skills.md` §6 and the dataviz skill's anti-pattern catalogue.
The research notes (§3 there) also explain how this editorial look stays distinctive rather than a generic "broadsheet":
serif only for computed sentences, uppercase only where it labels data or navigation, mono only for codes, the range
strip and the ink / orange grammar as the signature, and no newspaper costume (no columns of justified text, no drop
caps, no datelines).
