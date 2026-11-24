# Design system: "Editorial Precision"

This is the canonical, as-built design system of the Celeris control tower (`dashboard/`). Code against it. The
Executive overview (`dashboard/src/views/Overview.tsx`) is the reference implementation: when in doubt, copy what it does.

The dashboard reads like a well-edited planning report: typography leads, one confident accent, rules and whitespace
instead of boxes, every chart title states its conclusion, annotations tell the story. It is light-first; the dark
theme is a selected palette, not an inversion.

> **The one rule: ink is the past, cobalt is the future.** History, actuals and anything already known are drawn in
> ink (near-black, near-white in dark). The forecast, its band and anything predicted are drawn in cobalt. No other
> colour is loud. The rail's colour key teaches it in five seconds; every view must keep it.

Contents: [1 Principles](#1-principles) · [2 Tokens](#2-tokens) · [3 Typography](#3-typography) ·
[4 Layout and shell](#4-layout-and-the-shell) · [5 Components](#5-components) · [6 Charts](#6-charts) ·
[7 Headline templates](#7-headline-templates) · [8 Numbers and copy](#8-numbers-and-copy) ·
[9 Accessibility](#9-accessibility) · [10 Do and don't](#10-do-and-dont) ·
[11 Restyling a view](#11-restyling-a-view-checklist-and-per-view-notes) · [12 Files](#12-file-map)

---

## 1. Principles

1. **Answer first, evidence second.** Every view runs: headline → standfirst → hero evidence → supporting modules →
   detail. A planner who reads only the headline leaves with the answer.
2. **Ink is the past, cobalt is the future.** Colour carries time. Semantic colour (loss, status) appears only where it
   means something.
3. **Conclusion titles, computed.** Headlines and module titles are sentences built from the data by deterministic
   templates, never typed numbers. When a template's condition fails, a descriptive title is used ([§7](#7-headline-templates)).
4. **Annotate instead of legend-hunting.** The key sits inline above the chart; the story lives in two to five
   annotations placed on the data with leader lines.
5. **Rules, not boxes.** Structure comes from a 1px rule above each module and consistent spacing. Raised surfaces,
   radius and shadow are only for things that float: popovers, drawers, tooltips, menus, toasts.
6. **One hero per view.** One number set large (sans, 54px). Everything else is a supporting figure.
7. **Restraint.** One accent, three type families, a small spacing scale; no gradients, glow, decoration or icons as
   ornament.

---

## 2. Tokens

All tokens are CSS custom properties in `dashboard/src/styles/tokens.css`. Charts read the same variables at render time
through `readTheme()` (`charts/theme.ts`), so one token set drives HTML and canvas. **Never hard-code a hex in a view.**

Dark values apply under `:root[data-theme="dark"]`, and under `@media (prefers-color-scheme: dark)` unless the user
picked light (`:root:not([data-theme="light"])`). The app always sets `data-theme` on `<html>` before the first render.

### 2.1 Interface colours

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#FBFBF9` | `#0E1117` | page and chart surface |
| `--rail` | `#F3F4F6` | `#12161E` | navigation rail |
| `--raised` | `#FFFFFF` | `#161B24` | popover, drawer, tooltip, input, pressed segment |
| `--hover` | `#ECEEF2` | `#1C222D` | hover wash, segmented track, neutral chip |
| `--ink` | `#121826` | `#E9ECF2` | primary text, **history line**, hero numbers (17.1:1 / 16.0:1) |
| `--ink-2` | `#3D4556` | `#B6BDCA` | secondary text, standfirst, table body (9.3 / 10.0) |
| `--ink-3` | `#5E6678` | `#8E97A8` | muted text, axis labels, captions (5.6 / 6.4) |
| `--ink-4` | `#8A91A0` | `#5F6878` | **non-text marks only**: shipped hairline, benchmark bars, "Other" |
| `--rule` | `#E4E6EA` | `#232935` | hairlines between rows and figures |
| `--rule-strong` | `#C9CED6` | `#343B49` | module rule, axis baseline, control borders |
| `--grid` | `#E9EBEF` | `#1D232D` | chart gridlines (solid, 1px) |
| `--accent` | `#2B4BD6` | `#8199FF` | **forecast line**, links, focus ring, selected-row inset |
| `--accent-text` | `#2B4BD6` | `#8FA5FF` | accent as text (links, the FORECAST zone label) |
| `--accent-strong` | `#1F38A8` | `#A9B9FF` | link hover, pressed, P10–P90 whiskers |
| `--accent-wash` | `#F2F5FE` | `#121A2E` | forecast-window tint, selected table row |
| `--accent-band` | `rgba(43,75,214,.20)` | `rgba(129,153,255,.24)` | P10–P90 band fill |
| `--accent-edge` | `rgba(43,75,214,.50)` | `rgba(129,153,255,.55)` | P10 / P90 edge hairlines, dotted P50 |
| `--accent-tint` | `#B9C6F2` | `#34407A` | de-emphasised forecast bars (non-leaders) |
| `--loss` | `#B4501E` | `#F0905A` | lost-sales text and label (4.9 / 8.0) |
| `--loss-fill` | `rgba(205,104,48,.30)` | `rgba(240,144,90,.30)` | the shipped-versus-demand gap |
| `--good` / `--good-wash` | `#1A7F37` / `#E7F4EB` | `#4CC07A` / `#12261B` | resolved, checks pass |
| `--warn` / `--warn-wash` / `--warn-mark` | `#8A5A00` / `#FBF1DA` / `#D99A06` | `#E7B149` / `#2A2210` / `#E7B149` | provisional, in review, risk |
| `--crit` / `--crit-wash` | `#B42318` / `#FCEBE9` | `#FF7A6B` / `#2D1614` | act now, failed check |
| `--scenario` | `#B26B00` | `#E0A040` | what-if scenario line (solid) |

Rules: text never wears a series colour (exceptions: `--accent-text` for links and the FORECAST label, `--loss` for the
"lost" label). Status colours always come with an icon or a word. White on `--accent` is 6.8:1, but the default primary
button is ink-filled.

### 2.2 Chart roles

| Role | Token | Mark |
|---|---|---|
| Unconstrained demand (history) | `--ink` | 2px line, round join |
| Shipped, where lower than demand | `--ink-4` | 1px line, only on months where the gap is above 0.4 % (plus neighbours) |
| Lost to stock-outs | `--loss-fill` | area between shipped and demand |
| Months with rebuilt cells | `--ink` ring on `--paper` | 8px hollow marker where rebuilt cells cluster (>1.5 % of cells at aggregate; every one for a single series) |
| Forecast (submitted) | `--accent` | 2px line joined to the last actual |
| P10–P90 band | `--accent-band` + `--accent-edge` | stacked area + 1px edges, fanning out of the last actual |
| P50 | `--accent-edge` | dotted 1px, only when it departs from the forecast by more than 1px; always in the tooltip |
| Forecast window | `--accent-wash` | markArea from the last actual to the end |
| Last actual | `--ink` | solid 1px vertical rule, labelled "Oct 2026 · last actual" |
| Benchmark / another forecast | `--ink-3`, `--ink-4` | 1.5px **dashed 4/3** (dashing means "another forecast"; never gridlines) |
| What-if scenario | `--scenario` | 2px solid; base forecast stays cobalt; gap labelled at the end |
| Data error fixed (anomaly) | `--cat-2` rust | 9px hollow diamond |
| Real event (anomaly) | `--cat-1` teal | 9px filled triangle |

### 2.3 Categorical palette (no blue: blue means forecast)

| Slot | Token | Family (fixed by family index) | Light | Dark |
|---|---|---|---|---|
| 1 | `--cat-1` | Brake & Safety Systems | teal `#008A7C` | `#1A9E93` |
| 2 | `--cat-2` | Chassis & Structural | rust `#C8502A` | `#D9643C` |
| 3 | `--cat-3` | Electrical Assemblies | violet `#6D5BD0` | `#8A7BEA` |
| 4 | `--cat-4` | Hydraulic Systems | green `#4E8A2E` | `#5E9C3A` |
| 5 | `--cat-5` | Powertrain Components | plum `#9C4A9A` | `#B060AE` |
| 6 | `--cat-6` | Precision Machined Parts | ochre `#C27C0E` | `#B97F17` |
| 7 | `--cat-7` | Thermal Management | rose `#D0638B` | `#CB6690` |
| – | `--cat-other` | "Other" fold | `= --ink-4` | `= --ink-4` |

In TS: `theme.cat[0..6]` are slots 1–7 and `theme.cat[7]` is "Other". Cobalt is deliberately **not** in the array.

Validated 2026-11-24 with the dataviz validator (Machado 2009 CVD simulation, OKLab ΔE×100), both modes ALL PASS:

| Check | Light (on `#FBFBF9`) | Dark (on `#0E1117`) |
|---|---|---|
| Lightness band | L 0.43–0.77 | L 0.48–0.67 |
| Chroma floor | all ≥ 0.10 | all ≥ 0.10 |
| Worst adjacent CVD ΔE | 12.3 (rose ↔ ochre, deutan) | 12.7 |
| Worst adjacent normal ΔE | 16.2 | 17.0 |
| Contrast vs surface | all ≥ 3:1 | all ≥ 3:1 |

Rules: colour follows the entity (filtering never repaints survivors); regions use slots 1–6 in region order and
channels 1–4, never in the same chart as families; more than 7 series fold into "Other" or become small multiples;
stacks are ordered by slot with a 2px surface gap. **Use categorical colour last**: usually one entity in ink or cobalt
and the rest in `--ink-4` says more.

### 2.4 Sequential and diverging ramps

| Ramp | Tokens (1 = near zero) | Use | TS |
|---|---|---|---|
| Slate (history magnitudes) | `--slate-1 … --slate-7` | shortfall heatmap, zero-month calendar, issue × month strip, waterfall steps | `theme.slate[0..6]` |
| Cobalt (forecast magnitudes) | `--cobalt-1 … --cobalt-7` | forecast by family × month, procurement buffer heat | `theme.cobalt[0..6]` |
| Diverging steel ↔ rust | `--div-1 … --div-9` | bias, correlation, change vs last year | `theme.diverging[0..8]` |

Diverging: `div-1` is strong **steel (negative pole)**, `div-5` the neutral grey middle, `div-9` strong **rust (positive
pole)**. Steel is deliberately not cobalt, so a bias map is never read as forecast volume. Always name the poles in
words in the scale legend ("under-forecast", "over-forecast"). For ordinal use (tiers, horizon buckets) start at step 3.

### 2.5 Spacing, radius, elevation, motion, layout

| Group | Tokens |
|---|---|
| Spacing (px) | `--sp-2 4 6 8 10 12 14 16 20 24 30 40 48 56` (`var(--sp-14)`); use `gap`, not per-element margins |
| Layout | `--rail-w` 232px (212 ≤ 1180px) · `--measure` 1128px · `--gutter` 40px (32 ≤ 1280, 24 ≤ 1100, 16 ≤ 900) · `--module-gap` 30px · `--col-gap` 48px |
| Radius | `--r-1` 3px (chips in text, rail item) · `--r-2` 6px (controls) · `--r-3` 10px (popover, drawer) · `--r-tt` 8px (tooltip) · `--r-pill` (pills, badges) |
| Elevation | flat (everything on the page) or `--shadow-pop` (floating only). **No shadow on modules.** |
| Motion | `--ease` `cubic-bezier(.2,.7,.2,1)`, `--dur` 180ms, `--dur-fast` 150ms. Hover washes are instant; popovers fade and rise 6px; drawers slide 24px; charts update in 300ms and dim to 60 % while busy; no load animation on numbers; `prefers-reduced-motion` disables all of it. |
| Borders | 1px everywhere: `--rule` between rows, `--rule-strong` above modules and around controls, `--ink` above the figure strip when it marks where the numbers start (`heavy`). Selected tab: 2px ink underline. |

Deprecated aliases (`--surface`, `--muted`, `--hair`, `--history`, `--demand`, `--accent-ink`, …) exist only for views
not yet restyled. Do not use them in new code.

---

## 3. Typography

Self-hosted, SIL Open Font License 1.1, latin-subset woff2 in `dashboard/src/assets/fonts/`, `font-display: swap`. No
CDN request at runtime (Vite fingerprints and bundles them).

| Family | Token | Use | Fallback |
|---|---|---|---|
| **Source Serif 4** (variable opsz 8–60, wght 400–700) | `--font-serif` | the editorial voice: headline, standfirst, the brief, drawer headline, recommended action | Source Serif Pro, Georgia, Times New Roman |
| **IBM Plex Sans** (variable 400–700) | `--font-sans` | interface and evidence: labels, numbers, tables, charts | Helvetica Neue, Arial, system-ui |
| **IBM Plex Mono** 400 / 500 | `--font-mono` | identifiers: SKU codes, Record_IDs, hashes, commands | ui-monospace, Menlo, Consolas |

Scale (use the shorthand tokens: `font: var(--t-title)`):

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
| `--t-small` | 13/1.50 · sans | dek, table body, chips |
| `--t-caption` | 12/1.45 · sans | figure context, annotations, footnotes |
| `--t-axis` | 11.5/1 · sans | axis ticks |
| `--t-eyebrow` | 11/1.3 · 600 · sans, UPPERCASE, +0.09em | section labels, brief lead-ins, FORECAST zone label (class `.eyebrow`) |

Numerals: **proportional** on hero and figure values (`tabular-nums` makes "121" look loose); **`tabular-nums`** in
tables, axis ticks, tooltips, the range strip and every column of numbers (`.num`). Utility classes: `.mono`, `.id`
(mono 500), `.serif`, `.eyebrow`, `.caption`, `.ink-2`, `.muted`, `.visually-hidden`. Sentence case everywhere;
UPPERCASE only for eyebrows; no title case.

---

## 4. Layout and the shell

```
┌ rail 232 ┬─────────────────────────────────────────────────────────────────────────────┐
│ Celeris  │ masthead 56: view | SECTION (i) [provisional pill]   Units|USD  Orders|Latent ☾ Copy link │
│ key      ├─────────────────────────────────────────────────────────────────────────────┤
│ guide    │ filter bar (sticky): Family▾ SKU▾ Region▾ Channel▾ Customer▾        3,093 series in view Reset │
│ TOC      ├─────────────────────────────────────────────────────────────────────────────┤
│ …        │ .page (max 1128 + gutters): lede 8|4 → modules, gap 30                       │
│ foot     │                                                                              │
└──────────┴──────────────────────────────────────────────────────────────────────────────┘
```

- **Rail** (`components/shell/Rail.tsx`): wordmark with the two-ink-one-cobalt glyph; the colour key with the actual
  and forecast spans (computed from the calendar); a dismissible reading guide (remembered in `localStorage`); the
  table of contents in reading order with section markers (Overview = split ink/cobalt, What happened = ink, What will
  happen = cobalt, Act = outlined) and the live exception count; the provenance footer (quantile self-check). Below
  900px it collapses to a top bar with a "Views" button.
- **Masthead** (`components/shell/Masthead.tsx`): view name, section eyebrow, an "i" with the view's question
  (`VIEWS[].blurb` in `app/context.ts`), the provisional status pill **only while `meta.provisional`** (now false, so
  it is absent), and the global lenses as quiet segmented controls, the theme toggle and Copy link (toast "Link copied").
- **Filter bar** (`components/FilterBar.tsx`): five cascading chips in hierarchy order; each opens a combobox popover
  (search for SKU and Customer; the SKU list is ranked by last-12-month units with mono codes and volume bars; the
  customer note explains "customer at the time"). Right end: "**N** series in view" and Reset. It writes the URL hash.
- **Page** (`main.page`): a single grid column with `gap: 30px`. A view returns a fragment of top-level blocks (Lede,
  Modules, FigureStrip, column wrappers); never wrap them in a card.
- **Column helpers**: `.cols-7-5`, `.cols-5-7`, `.cols-4-8`, `.cols-2`, `.cols-3` (all `minmax(0, …)`, stack below
  1180px; `.cols-4-8` below 1100px), and `.stack` for a vertical group of modules inside a column.
- **Responsive**: works down to 1100px with the rail; 1280px hides the masthead eyebrow, 1180px stacks columns, folds
  the figure strip to 2×2 and hides "Copy link"'s label; 900px collapses the rail; below 640px chart annotations
  become a numbered list.

Global state lives in the URL hash (`state/url.ts`): `#/<view>?fam=HYD&sku=HYD-004&reg=Europe&ch=…&cust=…&m=usd&lens=latent`.
Put in-view UI state there too with `setParam(patch, true)` (replace, no history entry), so every state is a link. The
overview uses `tl` (range preset), `ev=1` (event rug), `by` (breakdown tab); the inbox reads `case=<row>`.

---

## 5. Components

Import from the component files (new code) or from `components/ui.tsx` (a barrel that re-exports everything plus the
deprecated `Card`, `Kpi`, `TimelineLegend`). All props are typed; the signatures below are exact.

### 5.1 The view header: `Lede` (`components/Figure.tsx`)

```ts
Lede({ headline: string; standfirst?: string | ReactNode; eyebrow?: ReactNode; figure?: ReactNode })
// alias: ViewHeader
```
Headline and standfirst on 8 columns, the hero figure on 4 behind a vertical `--rule-strong` hairline. A string
standfirst may carry `**bold**` markers for the key numbers (rendered by `Rich`). Both are computed ([§7](#7-headline-templates)).

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
// band P10–P90 with edges, cobalt tick at `mid`, ink tick at `reference`; each label sits at the track end nearest its
// mark; in figures narrower than 290px the labels take a row each.
Ladder({ rows: { label: string; value: number; me?: boolean }[]; max?: number; format: (v: number) => string; foot?: ReactNode })
Sparkline({ history: ArrayLike<number|null>; forecast?: ArrayLike<number|null>; divider?: number; height?: number; ariaLabel: string; floor?: number })
// inline SVG; history ink, forecast cobalt (repeat the last actual as its first point), window washed from `divider`
Meter({ segments: { value: number; tone: "good" | "warn" | "ink" | "accent" | "rest"; label?: string }[]; ariaLabel: string })
Delta({ value: number; digits?: number; suffix?: ReactNode })   // "▲ 3.5%" in ink: a change of demand takes no status colour
Rich({ text: string })                                          // "**x**" -> <b>x</b>, no HTML injection
```

### 5.3 Modules: `Module`, `Key`, `KeyMark`, `timelineKey` (`components/Module.tsx`)

```ts
Module({ title: ReactNode; dek?: ReactNode; tools?: ReactNode; info?: InfoProps; keyItems?: (KeyItem | "sep")[];
         foot?: ReactNode; heavy?: boolean; id?: string; className?: string; level?: 2 | 3; children?: ReactNode })
KeyItem = { kind: KeyKind; label: ReactNode; color?: string; title?: string }
KeyKind = "line" | "thin" | "dash" | "dot" | "box" | "band" | "ring" | "point" | "diamond" | "triangle" | "rule"
Key({ items: (KeyItem | "sep")[]; ariaLabel?: string })
KeyMark({ kind: KeyKind; color?: string })                       // a mark alone, for any legend
timelineKey({ latent?, fc?, band?, lost?, rebuilt?, columns?, extra?: KeyItem[] }): (KeyItem | "sep")[]
```
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
IconButton({ label: string; children } & ButtonHTMLAttributes)
LinkButton({ onClick: () => void; children: ReactNode; title?: string })      // an action inside prose
MoreLink({ onClick?: () => void; href?: string; children: ReactNode })      // "Data health →" evidence link
```
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
leftwards from the right edge. The leader is cobalt (forecast) or ink (history), the rest tinted (`--accent-tint`,
`--slate-3`). Bars are 10px high with a 2px data-end radius.

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
               csvName?: string; initialSort?: { key: string; desc: boolean }; empty?: string; ariaLabel?: string })
Column<R> = { key: string; label: string; value: (r: R) => number | string | null; render?: (r: R) => ReactNode;
              num?: boolean; width?: number; wrap?: boolean; clamp?: boolean; id?: boolean; fc?: boolean }
InlineBar({ value: number; max: number; label: ReactNode; lead?: boolean; tone?: BarTone; width?: number })
toCsv(rows, cols): string;   download(name, text, type?)
```
Header 11.5px ink-3 over a `--rule-strong` line, ▾ / ▴ on the sorted column; rows 13px on `--rule` hairlines, no zebra,
hover wash; selected row = `--accent-wash` + 2px cobalt inset on the first cell. `num` right-aligns with tabular
numerals; `id` sets Plex Mono 500; `clamp` clamps long text to 2 lines (full text in the title tooltip or the drawer);
`fc` heads a forecast column with a 2px cobalt rule (the colour grammar inside a table). Rows are focusable and Enter
opens. Every chart should have a table twin with the same columns as its CSV.

### 5.6 Floating surfaces (`components/overlays.tsx`)

```ts
Popover({ trigger: ReactNode; triggerClassName?: string; ariaLabel?: string; title?: string; align?: "left" | "right";
          width?: number; children: ReactNode | ((close: () => void) => ReactNode) })
Info({ what: ReactNode; how?: ReactNode; source?: string; align?: "left" | "right"; size?: "sm" | "md" })   // the "i"
Drawer({ title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; width?: number })
toast(text: string)            // bottom-left, auto-dismiss after 4 s; <ToastHost/> is mounted once by the shell
useDismiss(open, close)        // ref for "close on outside click and Escape"
```
- Every module carries an `Info`: **what it shows · how it is computed · source file**. 340px, 12.5px.
- `Drawer` anatomy (case file, lineage): eyebrow ("CASE 1 OF 286 · LOST ACCOUNT") → serif computed headline
  (`--t-case`) → identity line (`sub`) → in the body: three-figure strip → series chart → "Why it is flagged" (sans,
  `h3` renders as an eyebrow) → "Recommended action" in serif (`className="action"`) → facts `<dl className="facts">`
  → status segmented, note, actions. It slides from the right over a 30 % paper scrim; Escape closes; focus moves in
  and returns.

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
Close, Search, Menu, ArrowRight, Download, TableIcon, Glyph` (all take `size`). Icons are functional, never decoration.

---

## 6. Charts

### 6.1 Theme and helpers (`charts/theme.ts`)

`const { theme } = useApp()` gives the `Theme` read from the CSS tokens for the active theme; put `theme` in your
`useMemo` deps so charts re-render on the toggle. Fields: `paper raised hover ink ink2 ink3 ink4 rule ruleStrong grid
accent accentText accentStrong accentWash accentBand accentEdge accentTint loss lossFill good warn warnMark crit
scenario cat[8] slate[7] cobalt[7] diverging[9] shadowPop` (plus deprecated aliases `surface muted axis history demand
forecast forecastBand forecastP50 baseline zone seq[13] div[7] error event tooltipBg tooltipBorder` for unconverted views).

| Helper | Signature | What it gives |
|---|---|---|
| `baseOption` | `(t) => {...}` | Plex Sans, ink-3 text, `animation: false` on first paint, 300ms updates, aria on |
| `categoryAxis` | `(t, data, extra?)` | 1px rule-strong baseline, no ticks, no gridlines, ink-3 11.5px labels |
| `valueAxis` | `(t, { max?, min?, usd?, percent?, name? })` | zero baseline, 4 intervals to `max`, compact labels ("150K", "$12M", "40%"), solid 1px grid |
| `axisStyle` | `(t)` | the value-axis look as a spread (legacy-compatible) |
| `gridStd` | `(narrow?, extra?)` | `{left 46, right 92, top 30, bottom 30}` (92px right margin for end labels); phones 34 / 58 |
| `niceMax` | `(v) => number` | smallest 1 / 1.2 / 1.6 / 2 / 2.4 / 3 / 4 / 5 / 6 / 8 × 10ᵏ ≥ v (quarters are round) |
| `axisTick` | `(v, usd?) => string` | "0", "7.5K", "150K", "$2.4B" with a true minus |
| `tooltipStyle` | `(t)` | floating surface: raised, 1px rule, 8px radius, `--shadow-pop`, confined |
| `axisTooltip` | `(t, (items) => html)` | axis trigger with a 1px ink-3 crosshair that snaps to the category |
| `ttHead` / `ttRow` / `ttNote` / `ttEnd` | `ttHead(title, "actual" \| "forecast" \| tag?)`, `ttRow(color, label, value, kind?)` | tooltip HTML: header with the ACTUAL / FORECAST tag; rows lead with the **value** (600, tabular) then the label; `kind` = `"line"` (default), `"dash"` (another forecast) or `"box"` (an area) |
| `esc` | `(s) => string` | escape data labels before they go into tooltip HTML |
| `onFill` | `(t, fill) => string` | ink or paper label colour by fill luminance (heatmap cells, bar labels) |
| `barStyle`, `BAR_MAX` | `(color, horizontal?)`, `24` | 2px data-end radius, square baseline; bars at most 24px thick |
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
  series: [{ type: "bar", data, barMaxWidth: BAR_MAX, itemStyle: barStyle(t.slate[3]) }],
}), [t, …]);
<EChart option={option} height={260} ariaLabel="Lost units by month, 2019–2026" />
```

### 6.2 `EChart` (`charts/EChart.tsx`)

```ts
EChart({ option: EChartsCoreOption; height: number; onClick?: (e: ChartEvent) => void; onXClick?: (index: number) => void;
         xGrid?: number; ariaLabel: string; className?: string; busy?: boolean; onLayout?: (chart: ECharts) => void; children?: ReactNode })
```
Tree-shaken ECharts 6 (line, bar, scatter, heatmap, custom; grid, tooltip, markArea / Line / Point, visualMap, legend,
dataZoom, aria). `busy` dims the previous render to 60 %; `onLayout` fires after each setOption and resize (for overlays
using `convertToPixel`); `children` render over the canvas; with focus, ← → move the crosshair and Esc hides it. The
`height` includes the axis band.

### 6.3 The shared timeline (`charts/timeline.ts`, `charts/TimelineChart.tsx`)

Every view that shows history and forecast uses it. One continuous axis Jan 2019 – May 2028. Layers bottom to top:
forecast-window wash → lost-sales gap → P10–P90 band (starting at the last actual with zero width) → P10 / P90 edges →
shipped hairline (only where lower) → unconstrained demand (ink) → rebuilt-cell rings → forecast (cobalt, first point =
last actual) → last-actual rule → HTML annotations → end label.

```ts
TimelineChart({ spec: Omit<TimelineSpec, "narrow" | "height">; annotate?: (model: TimelineModel) => Annotation[];
                height?: number /* 360 */; ariaLabel: string; busy?: boolean; onXClick?: (absoluteMonth: number) => void;
                footnote?: (model: TimelineModel) => ReactNode })

TimelineSpec = {
  m, theme, measure, lens, filters,
  hist?: { shipped, demand, imputed, cells, missing?, unknownDemand? },   // HistoryAgg fields; latent lens: pass h.latent as shipped and demand
  fc?:   { value, p10?, p50?, p90? },                                     // ForecastAgg fields (window months)
  anomalies?: TimelineAnomaly[];   lines?: TimelineLine[];               // extra lines: { name, data (nMonths), color, dashed?, width? }
  range?: "all" | "recent" | "window" | [first, last];   zoom?: [first, last] /* legacy */;
  showEvents?: boolean /* event rug */;   columns?: boolean /* one series */;   narrow?: boolean;   height?: number }

buildTimeline(spec) => TimelineModel { option, start, labels, yMax, frame, demand, shipped, fc, p10, p50, p90, p50Drawn, p50MaxRel, hasBand, latent }
timelineOption(spec) => EChartsCoreOption        // legacy: option only, no overlay
rangePresets(m) => Option[]                      // computed labels "2019–2028", "Since 2024", "Forecast window"
rangeStart(m, preset) => number;  laneEvents(m, filters);  eventTitle(description)
timelineAnnotations({ spec, model, exceptions?, exceptionRows?, include? }) => Annotation[]
```

Behaviour you get for free: range presets (no slider); a zero baseline with headroom for annotations; the P50 dotted line
only when it departs by more than 1px (`p50Drawn`; use `p50MaxRel` in the footnote); **one series → `columns: true`**:
history as ink columns (shipped + lost stacked), forecast as cobalt columns with P10–P90 whiskers, the divider and
wash on the band edge; the latent lens swaps history and forecast to latent demand and drops the band (say so in the
dek); `unknownDemand` keeps ERP-blank cells out of the lost-sales gap; the tooltip lists demand, shipped, lost and
rebuilt cells in history and forecast, P90, P50, P10 in the window, plus any extra line.

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
| rebuilt cells | the largest cluster of months with rebuilt cells | "ERP migration / 363 cells rebuilt, not zero-filled, Mar–May 2023" |
| window event | the largest `window_event` group in `exceptions.json` for the selection | "Orion Driveline shutdown / −5,420 units, Jul–Aug 2027" |
| divider + zone | a forecast or extra line is shown | "Oct 2026 / last actual" and "FORECAST / 19 months" |
| end label | a forecast is shown (lines mode) | "153K / P10–P90 151K–155K" |

Placement: labels are measured and wrapped (title 12.5px 600 ink, text 12px ink-3, max 190px), then placed in empty
space above or below the lines (never over a line, another label or the divider), choosing the shortest leader; past
labels stay left of the divider; future labels start at the divider, capped at the window width. A 1px ink-3 leader
runs from a 3.5px dot (ink for the past, cobalt for the future, 2px paper ring) and stops at the label's edge when it
would cross it. At most five story labels per chart; below 640px only the zone and end labels remain and the rest
become a numbered list under the chart. Write your own generator returning `Annotation[]` for other charts and pass
it to `TimelineChart.annotate` (or use `AnnotationLayer` with `EChart.onLayout`).

### 6.5 Other chart forms

- **Bar tables** (rankings, change): HTML `BarTable`, not canvas.
- **Small multiples**: one per entity on a shared scale; prefer the **moving annual total** indexed to the last 12
  actual months = 100 with a hairline at 100; history ink, forecast cobalt, window washed, a dot at "year to Oct 2027";
  the header carries name, change and volume; clicking filters the page. (Overview `MiniMat` is the reference.)
- **Heatmaps**: slate for history, cobalt for forecast, steel ↔ rust for signed values; 2px paper gaps between cells
  (`itemStyle.borderColor: t.paper, borderWidth: 2`); a value label only where the cell fits, coloured with `onFill`;
  a scale legend with the poles named in words.
- **Waterfall** (forecast X-ray, row waterfall): horizontal slate steps, the final bar cobalt (forecast) or ink
  (history total), multiplicative steps labelled "× 1.12 season", connectors 1px `--rule-strong`.
- **Gantt** (lifecycle): active span slate step 4, in-window part cobalt tint; ▲ launch, ■ EOL, ○ planned; the
  predecessor link a hairline; a "today" rule at the last actual.
- **Dot / dumbbell** for before → after comparisons (data health, accuracy by aggregation level).
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
renderAll({ a: t1, b: t2 }, f) => { a: string, b: string }
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

### 7.4 Templates specified for the other views (implement in `insights/<view>.ts`)

| View | Headline template | Hero figure |
|---|---|---|
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
| `monthName` = `monthShort`, `monthLong`, `monthOnly(l, long?)`, `monthSpan(a, b)`, `yearSpan(a, b)` | `Oct 2026`; `October 2026`; `Oct` / `October`; `Mar–May 2023`, `Dec 2026 – Feb 2027`; `2021–22` |
| `MINUS` | U+2212 |
| legacy `compact`, `fmtUsd`, `fmtMeasure` | kept for unconverted views (now with a true minus) |

Copy rules:

- A true minus (−), never a hyphen; thin units ("2.79M units", "$2.50B"); percentages with one decimal, two when the
  story is a tiny shift ("0.34 pts").
- Months "Oct 2026" in charts and tables, "October 2026" in serif prose, **never ISO (`2026-10`) in reading text**
  (ISO stays in CSV, the URL and code). Pipeline prose that contains ISO months goes through `readableMonths()`
  (`insights/briefing.tsx`).
- Sentence case; UPPERCASE only for eyebrows; no exclamation marks; no "simply", "just", "powerful".
- Figures: label, value, one line of context in plain words, an evidence link ("Data health →").
- Empty and error states say what happened and what to do; errors name the cause and the fix.
- Every number on screen comes from the bundle. If a number is not in the bundle, it does not go on screen.

---

## 9. Accessibility

- **Contrast**: text uses `--ink`, `--ink-2`, `--ink-3` (≥ 5.6:1 on paper in both themes), `--accent-text` for links,
  `--loss` for the lost label. `--ink-4` is for marks only.
- **Colour is never alone**: status pills carry a word, warn/crit dots carry a visually hidden label, anomaly types are
  double-encoded by shape (diamond / triangle), the past/future split is also a rule and a wash, forecast columns in
  tables are headed by a cobalt rule *and* sit right of the history.
- **Focus**: a 2px `--accent` outline with 2px offset on every interactive element (`:focus-visible`). Table rows,
  small multiples and rank rows are buttons or focusable rows; Enter opens.
- **Keyboard**: Segmented, RangePresets and Tabs move with ← → (roving tabindex); filter comboboxes open with ↓, move
  with ↑ ↓, choose with Enter, close with Escape; popovers and drawers close with Escape; charts take focus and move
  the crosshair with ← →.
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
| Draw history in ink, the forecast in cobalt, the band in `--accent-band` | Use blue for a category, a status or a "nice" accent |
| Use `TimelineChart` for any history-into-forecast chart | Build a second timeline with its own colours and a zoom slider |
| Annotate 2–5 facts on the data; keep a short inline key | Ship a 7-item legend or a number on every point |
| Use slate for history magnitudes, cobalt for forecast magnitudes, steel ↔ rust for signed values | Use a rainbow, or cobalt for a bias map |
| Emphasise one entity and grey the rest (`--ink-4`) | Paint eight categorical hues when the story is one line |
| Use `Segmented` for lenses, `Tabs` for content, `RangePresets` for time | Fill a segmented control with ink |
| Format with `data/format.ts`; months as "Oct 2026" | Show ISO months, hyphen-minus or `toFixed` output |
| Keep in-view state in the URL with `setParam(patch, true)` | Keep shareable state in component memory only |
| Put view-only CSS in `views/<View>.css` imported by the view | Add rules to `styles/legacy.css` or hard-code colours inline |
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
10. Delete the view's uses of deprecated aliases (`theme.seq`, `theme.div`, `theme.muted`, `var(--muted)`, `.card`,
    `.kpis`, `.badge`, `.legend`); then remove now-unused rules from `styles/legacy.css`.
11. `npm run build`, then screenshot light and dark at 1440×900 and 1280×720, one filtered state and one single series;
    check no overlapping or clipped text and that every number comes from the bundle.

### 11.2 Per-view notes (the specification for the remaining eleven views)

Every view: masthead, filter bar, then a lede (headline and standfirst on 8 columns, the hero figure on 4), then modules.

- **Data health** (history). Modules: row waterfall (horizontal slate, 248,248 raw rows → 245,548 grid cells, each step
  labelled with its rule, the final bar ink); rows affected by rule (bar table coloured by recovery method, categorical
  slots 1–3 with a key, sorted by rows); issue × month heat strip (slate, ERP months annotated); every check before and
  after (ledger with ✓ pass / ✕ fail pills and tabular metrics); duplicates and restatements (ledger, mono Record_IDs);
  numeric-state census (small bar table). A check row opens the lineage drawer filtered to that rule.
- **Demand explorer** (history). Left 4 columns: navigator (breadcrumb "All › Hydraulic Systems › HYD-004", search,
  ranked list with mono codes, two-line descriptions, volume bar and share; drills family → SKU → region → customer).
  Right 8 columns: the timeline (columns for a single series; "continue into forecast" on by default). Below:
  seasonality (current year ink, other years `--ink-4` hairlines, average dashed, labels on current year and average
  only); zero-month calendar (scheduled zero = slate 2 with "·", unexplained = crit-wash with ✕, non-zero = slate
  magnitude, tooltip with the reason); series card (`dl`: ordering cycle and changes, customers over time as a mini
  Gantt, demand class, stock-outs, fixes). Clicking a month opens the lineage drawer.
- **Anomaly monitor** (history). The timeline with anomaly marks (rust hollow diamonds = errors fixed, teal triangles =
  real events, key inline); counts by type (bar table); the register (ledger: type chip, reason clamped to 2 lines,
  action, a 4px slate confidence meter, impact; group by cause; CSV). A row opens the series in the explorer with the
  lineage drawer.
- **Stock-outs & lost sales** (history). Shipped versus unconstrained timeline with the loss gap; lost versus
  back-ordered by month (lost = `--loss-fill` with a solid edge, back-ordered = slate 4, each labelled once); shortfall
  heatmap family × month (slate; semiconductor months annotated); lost USD by year / family / region / reason (tabbed
  bar table, `tone: "loss"`); back-order mechanics (small ledger); largest lost-sales series (ledger → explorer).
- **Macro lead / lag** (history). Family × indicator matrix (diverging steel ↔ rust, ★ on the model's drivers at
  their lag, r printed where it fits); lag profile by era (small multiples, eras as ink shades, chosen lag dotted);
  model-free check (indicator shifted by its lag against demand, **indexed to 100 on one axis**, never dual-axis);
  indicator paths into the window with repaired cells as rings; EV shift by powertrain; per-SKU sensitivities as a dot
  plot.
- **Forecast & accuracy** (prediction). The timeline plus the time machine (segmented "Live | as of …"; the backtest
  forecast in cobalt with its own wash, actuals in ink continuing through, seasonal naive dashed ink-3); forecast table
  (month / quarter / year tabs with quantiles; forecast columns headed by the cobalt rule; a ✓ stamp "Bundle =
  submission.csv (2,793,254 units, 58,219 rows)"); forecast X-ray waterfall with a month selector; forecast value added
  (bar table naive → seasonal naive → cycle-aware → final, the noise floor as a labelled vertical hairline); WAPE by
  horizon (lines with end labels; final cobalt, baselines dashed ink-3 / ink-4); bias family × region (diverging,
  click filters); interval calibration (100 % bars below P10 / inside / above P90 with target ticks 10 / 80 / 10);
  accuracy by aggregation level (dumbbell naive → final).
- **Lifecycle** (prediction). Gantt of launches, EOL-announced, discontinued and planned SKUs by family with a "today"
  rule; run-offs to zero (small multiples ending in ■ at EOL, ✓ when the forecast is 0 after EOL); cold starts versus
  predecessor (predecessor history ink, the new SKU's forecast cobalt, aligned on launch month); recent launches still
  ramping.
- **What-if** (prediction). Left 4 columns: scenario builder (preset chips, indicator, shift slider, start and end,
  "remove window events" checkboxes, an ink-filled Apply). Right 8: the timeline with the base forecast (cobalt) and the
  scenario (`--scenario`, solid), the difference labelled at the end. Below: change in P90 cover, impact by family
  (diverging bar table). The scenario goes into the hash.
- **Exception inbox** (act). Hero: revenue at risk with a three-colour review meter (resolved / in review / new). Cause
  tabs (seven equal columns: All + six rules, each with name, $ at risk, count and a 3px bar; the selected one carries an
  ink overline). Work area: the ranked ledger (#, mono series with description, rule chip with a two-line why, at risk
  with bar, status pill; group by cause; Open | All) and the docked case file (`Drawer` anatomy; for lost accounts the
  series as columns, the pre-loss level as a dashed crit line and the "at risk if it returns" area washed in crit across
  the window). Status and notes stay in the browser. `case=<row>` in the hash opens a case (the overview uses it).
- **Procurement plan** (act). Tools: service level segmented (P80 | P90 | P95 | P97.5) and a lead-time stepper. Mean
  plus buffer by month (cobalt mean, cobalt-tint buffer stacked with a 2px gap); aggregate versus naive sum of quantiles
  (two bars with a risk-pooling annotation); buffer by SKU (bar table in units and USD); footnote "Gross requirements
  only: no inventory positions are provided."
- **Data download** (act). Extracts of the current selection (four rows with row count, size and "Build CSV"); bundle
  manifest (ledger: mono path, size, truncated SHA-256 with copy; a final / provisional pill per modelling input);
  pipeline hashes.

---

## 12. File map

```
dashboard/src/
  styles.css                 entry: imports the five files below in order
  styles/tokens.css          @font-face, every token, light + dark            (edit only to add a token)
  styles/base.css            element defaults, utilities, focus, reduced motion, print
  styles/shell.css           rail, masthead, filter bar, page grid, column helpers, breakpoints
  styles/components.css      lede, figures, modules, keys, annotations, controls, tables, tooltips, overlays, states, brief, rank list, multiples
  styles/legacy.css          TRANSITIONAL re-skin of Card / Kpi / grids / legends / badges (shrink it, never grow it)
  assets/fonts/              Source Serif 4, IBM Plex Sans (variable), IBM Plex Mono 400 / 500 (woff2, OFL)
  app/context.ts             AppState (useApp), VIEWS (titles, rail labels, blurbs), GROUPS (sections, eyebrows, markers)
  app/hooks.ts               useSelection(): segs, runs, series, single, h (HistoryAgg), fc (ForecastAgg)
  charts/theme.ts            readTheme, Theme, axis / grid / tooltip / bar helpers
  charts/EChart.tsx          the ECharts wrapper
  charts/timeline.ts         buildTimeline, timelineOption (legacy), presets, annotation generators
  charts/TimelineChart.tsx   <TimelineChart>: option + annotation overlay + narrow mode + footnote
  charts/Annotations.tsx     the annotation layout engine and overlay
  components/Figure.tsx      Lede, HeroFigure, Figure, FigureStrip, RangeStrip, Ladder, Sparkline, Meter, Delta, Rich
  components/Module.tsx      Module, Key, KeyMark, timelineKey
  components/controls.tsx    Segmented, RangePresets, Tabs, RuleChip, StatusPill, Button, IconButton, LinkButton, MoreLink
  components/tables.tsx      BarTable, BarTrack, InlineBar, DataTable, toCsv, download
  components/overlays.tsx    Popover, Info, Drawer, toast, ToastHost, useDismiss
  components/states.tsx      Skeleton, SkeletonText, SkeletonChart, Loading, Empty, ErrorState, Notice
  components/icons.tsx       inline SVG icons
  components/shell/          Rail.tsx, Masthead.tsx
  components/FilterBar.tsx   the five cascading filter chips
  components/Lineage.tsx     the cell lineage drawer
  components/ui.tsx          barrel + deprecated Card, Kpi, TimelineLegend
  data/format.ts             number, percentage and month formatting
  data/breakdown.ts          monthly sums by family / region / channel for a selection; shares last 12 vs next 12
  data/aggregate.ts          HistoryAgg (incl. unknownDemand), ForecastAgg, forecastLatent, sum
  insights/headlines.ts      the template engine and vocabulary
  insights/overview.ts       the overview's facts and templates (reference)
  insights/briefing.tsx      the brief (BriefItem { tag, tone?, body }), exceptionRowsIn, readableMonths, largestShift
  views/Overview.tsx (+ Overview.css)   the reference view
```

Dependencies are unchanged: React 19, ECharts 6, Vite 7, TypeScript 5.9. No UI or CSS framework, no icon package, no
font CDN.
