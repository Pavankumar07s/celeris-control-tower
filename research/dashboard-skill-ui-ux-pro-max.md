# UI/UX Pro Max — the team owner's first-priority design skill, applied to the Celeris control tower

Installed on 24 Nov 2026 at the team owner's instruction ("use this first") with
`npx claude-code-templates@latest --skill creative-design/ui-ux-pro-max` → `.claude/skills/ui-ux-pro-max/` (SKILL.md, three
read-only search scripts, CSV rule databases; a local copy, not included in the repository). The scripts were inspected before use: standard library only, they read the
CSVs and print; no network, no writes. Query it directly:

```bash
.venv/bin/python -s -E .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --design-system -f markdown
.venv/bin/python -s -E .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --domain chart|ux|web|style|typography|color
.venv/bin/python -s -E .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --stack react
```

**Every engineer and critic on the dashboard applies this file first, then the other checklists.**

> **Colour override (team owner, 24 Nov 2026):** the palette is black, orange and cream (the owner's "rover-hire" theme),
> not blue. Wherever this file says cobalt or blue for the forecast or the accent, read **orange** (`#ff6a13`; a darker
> burnt orange for lines and text on cream paper `#ede6d6`; ink `#141414`; black bands `#0a0a0a`). The grammar is
> "ink is the past, orange is the future". Full statement: top of `research/dashboard-design-skills.md`.

## 1. What the skill recommends for this product

Query: "analytics dashboard B2B SaaS supply chain demand planning forecasting data-dense professional enterprise".

| Aspect | Recommendation |
|---|---|
| Product type | Analytics Dashboard |
| Style | **Data-Dense Dashboard**: multiple charts, data tables, KPI figures, minimal padding, grid layout, space-efficient, maximum data visibility |
| Dashboard pattern | **Drill-Down Analytics + Comparative**: summary-to-detail flow, expandable sections, breadcrumbs, context preserved while drilling |
| Colour | Primary `#3B82F6`, secondary `#60A5FA`, call-to-action `#F97316`, background `#F8FAFC`, text `#1E293B`; "cool → hot gradients + neutral grey" for intensity |
| Typography | "Dashboard Data": a monospace for data (Fira Code) with a matching sans for labels (Fira Sans) |
| Effects | Hover tooltips, chart zoom on click, row highlight on hover, smooth filter transitions, loading indicators |
| Avoid | Ornate design; a dashboard with no filtering |

Chart guidance returned for our data:

| Data | Chart | Rule |
|---|---|---|
| Time-series forecast | Line with confidence band | Actual as a solid line; forecast visibly different; band as light shading; say which is which |
| Trend over time | Line (area as an option) | One primary colour; fills at about 20 % opacity; patterns or labels so it survives colour-blindness |
| Anomaly detection | Line with highlighted points | A marker on each anomaly plus a text annotation; red reserved for the anomaly |
| Compare categories | Bar, sorted descending | Value labels on the bars |
| Intensity matrix | Heat map | A clear numeric legend; divergent scale for ± data; do not rely on hue alone |
| Cumulative change | Waterfall | Increases and decreases in directional colours, each labelled; distinct start and end bars |
| Statistical spread | Box plot | Include the numbers (min, quartiles, median, max) |
| Many variables | Radar only with 5–8 axes | Otherwise grouped bars; always a table alternative |

## 2. How it is applied here

**Adopted in full**

- The **data-dense, drill-down** character for every view planners work in (Demand explorer, Anomaly monitor, Exception inbox,
  Procurement, Data health, Stock-outs, Forecast & accuracy): compact rows, minimal padding, tables first-class, breadcrumbs
  for family → SKU → region → customer, context (filters, lens, units) preserved while drilling.
- **Filtering everywhere**: the five shared filters stay visible at the top of every view.
- **Every chart rule in the table above.** In particular history and forecast must be distinguishable at a glance, the
  P10–P90 band is a light shading, anomalies carry a marker and a text annotation, ranked bars are sorted and labelled,
  heatmaps have a numeric legend, the waterfall labels each step.
- **Every accessibility, interaction, layout and motion rule** — the gate in section 3.
- **Icons are SVG** (one consistent set, fixed 24 × 24 view box); no emoji or text glyphs as icons.

**Reconciled with the Editorial Precision design system (already being built)**

| Skill says | We do | Why this honours the rule |
|---|---|---|
| Primary blue `#3B82F6`; background `#F8FAFC`; text `#1E293B` | Cobalt accent for the forecast and interactive elements, a near-white paper background, near-black ink text | Same roles and almost the same values: one trustworthy blue, a quiet light ground, dark slate text |
| Orange `#F97316` for the call to action | One warm accent reserved for "needs attention" (exceptions, lost sales, unconstrained gap) | A dashboard has no sales call to action; the warm accent marks what the planner must act on |
| Actual solid blue, forecast dashed orange | Actual solid **ink**, forecast **cobalt** with its band, P50 dotted | The rule is "clearly distinguish actual vs forecast"; colour carries time across the whole app (ink = past, cobalt = future) and line style backs it up |
| Mono for data + sans for labels (Fira Code / Fira Sans) | IBM Plex Mono for codes and tabular figures, IBM Plex Sans for the interface; a serif only for the one computed headline per view | Same principle (a technical mono paired with its sans family). The headline serif is the single departure; it must stay restrained — "ornate design" is the skill's named anti-pattern |
| Data-dense, minimal padding | Dense in operational modules; the top of each view keeps one headline, one hero figure and breathing room | The owner's `dashboard-designer` skill asks for 15–20 % white space and a clear hero; density applies below the fold line |
| "Chart zoom on click" | Range presets (full history / since 2024 / forecast window) and click-to-drill | Same capability, fewer accidental zooms |

If the team owner prefers the skill's literal palette or the Fira pairing, it is a token-level change in
`dashboard/src/styles` (colour and font custom properties) and does not affect layout.

## 3. The UI/UX Pro Max gate — tick for EVERY view, before any other checklist

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
9. Loading shows a skeleton or spinner — never a frozen screen; space is reserved so content does not jump.
10. Empty states show a helpful message and a next action; errors appear next to the problem.
11. The active view is highlighted in the navigation; the URL reflects view, filters and toggles (deep linking).

Layout and responsive (high)
12. Works at 1440, 1024, 768 and 375 px: no horizontal page scroll; wide tables scroll inside their own container or collapse to cards.
13. A defined z-index scale (10 / 20 / 30 / 50) — popovers, drawers and sticky bars never fight.
14. Body line height 1.5–1.75; prose line length 65–75 characters; body text at least 16 px on narrow screens.

Motion and performance (medium)
15. `prefers-reduced-motion` respected; continuous animation only for loading; animate `transform` / `opacity`, not size.
16. Views are lazy-loaded; heavy lists are not re-rendered needlessly; no layout shift when data arrives.

Style and charts
17. One style across all twelve views; SVG icons only; nothing ornate.
18. Chart form matches the data (section 1 table); actual vs forecast distinguishable at a glance; anomalies marked and annotated; bars sorted with value labels; heatmaps with a numeric legend.
