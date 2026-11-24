# Dashboard design skills and rule sets, merged for the Celeris control tower

> **COLOUR OVERRIDE (team owner, 24 Nov 2026) — applies to every dashboard file and supersedes any palette below or in
> the mocks:** no blue theme. The palette is **black, orange and cream**, taken from the owner's "rover-hire" project:
> paper `#ede6d6` / `#e4dbc8`, rule `#cbc1ad`, ink `#141414` / `#5f5849`, night `#0a0a0a` / `#151515`, chalk `#f2ede3` /
> `#a39d90`, accent orange `#ff6a13`, good `#087a08` (paper) / `#2fbf4f` (night), bad `#c93636`.
> The grammar is now **ink is the past, orange is the future** (wherever a document says "cobalt" or "blue = forecast",
> read orange). Light theme: cream content with black navigation and footer bands; dark theme: night with chalk text.
> Never orange text on cream (about 2.3:1): use a darker burnt orange for lines and text on paper, `#ff6a13` for fills,
> bands and anything on black. Orange stays scarce: forecast, the active marker, the primary action. Categories never use
> orange. Status colours always come with an icon or label. The mocks in `research/scratch/design-editorial` remain the
> bar for layout and typography only. `docs/design_system.md` is the canonical as-built statement.

> **MANDATORY — read section 9 first.** The team owner supplied a specific skill, `dashboard-designer`, and asked that
> the dashboard be designed with it. It is installed at `.claude/skills/dashboard-designer/SKILL.md` (project) and
> `~/.claude/skills/dashboard-designer/SKILL.md` (user). Section 9 maps its rules onto this dashboard and adds a
> 16-point gate that every view must pass.

Research note, 24 Nov 2026. The team owner asked us to "search the internet for the best dashboard skill". This note reads the best public agent skills, rule files and design guides for dashboards and front-ends, plus the two local skills (`dataviz`, `artifact-design`). It merges what they prescribe into one rule set for the adopted **Editorial Precision** direction (`research/scratch/design-editorial/spec.md`).

Everything was read as text. Nothing was installed, and no command from any page was run. Downloaded copies of the skill files are in `research/scratch/dashboard-design-skills/dl/`.

**The short answer.** There is no single "best dashboard skill". The strongest sources split into three layers, and we need all three:

1. **Taste and anti-generic rules** (how to stop looking like a template): Anthropic `frontend-design`, `impeccable` (Operate mode), `interface-design`, Uncodixfy.
2. **Chart craft** (how to make the numbers readable and honest): the local `dataviz` skill, Datawrapper, IBM Carbon, Claus Wilke on uncertainty, Stephen Few.
3. **Interface hygiene** (what a reviewer will catch): Vercel Web Interface Guidelines, the shadcn/ui skill rules, Vercel React best practices.

The spec already follows most of layer 2 and 3. The main risk the sources raise for us sits in layer 1: four of them name an "editorial / broadsheet" look as a known AI default. So the editorial voice has to be earned by data (computed sentences, a real signature move), never worn as a costume. Section 3 shows how to handle each of these conflicts.

---

## 1. Sources: what each is and whether to trust it

| # | Source | What it is | Weight for us |
|---|---|---|---|
| A1 | [Anthropic `frontend-design` skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | Anthropic's official skill for distinctive UI; the most-installed design skill | High: the canonical list of "generated page" tells |
| A2 | [Anthropic `web-artifacts-builder` skill](https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md) | React + Tailwind + shadcn artifact builder | Low: one anti-slop line |
| A3 | [Anthropic blog, "Improving frontend design through Skills"](https://claude.com/blog/improving-frontend-design-through-skills) (12 Nov 2025) | Why models converge on generic UI and how the skill steers | Medium: background |
| A4 | [Anthropic knowledge-work `data-visualization` skill](https://github.com/anthropics/knowledge-work-plugins/blob/main/data/skills/data-visualization/SKILL.md) | Chart selection and design principles (Python) | Medium: chart rules |
| A5 | [Anthropic knowledge-work `build-dashboard` skill](https://github.com/anthropics/knowledge-work-plugins/blob/main/data/skills/build-dashboard/SKILL.md) | Self-contained HTML dashboard recipe | **Counter-example**: it prescribes the exact look the owner rejected |
| L1 | Local skill `dataviz` | Design-system-agnostic chart method, mark specs, anti-pattern catalogue | **Highest for charts** |
| L2 | Local skill `artifact-design` | Page fundamentals, themes, "avoid AI-generated design" | High: shell, theme, copy |
| V1 | [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) (README and [command.md](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)) | Vercel's interaction, animation, layout, content, a11y rules; `command.md` is the review checklist | **Highest for interface hygiene** |
| V2 | [Vercel `web-design-guidelines` skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | Wraps V1 as a `file:line` reviewer | Use V1's rules directly |
| V3 | [Vercel `react-best-practices` skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | 70 performance rules, ranked by impact | Medium: bundle and re-render items |
| S1 | [shadcn/ui official skill](https://github.com/shadcn-ui/ui/tree/main/skills/shadcn) and [rules/styling.md](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/styling.md) | Composition and styling rules for shadcn apps | Medium: tokens, gap, status colour |
| S2 | [shadcn/ui Chart docs](https://ui.shadcn.com/docs/components/chart) | Chart theming by CSS variables, tooltip and legend parts | Low–medium |
| T1 | [Tailwind Catalyst application layouts](https://tailwindcss.com/blog/2024-05-24-catalyst-application-layouts), [Tailwind Plus shells](https://tailwindui.com/components/application-ui/application-shells/sidebar) | Sidebar / stacked / multi-column shells | Low: confirms a standard shell; catalogue pages are behind a login |
| T2 | Tremor | Pre-styled React dashboard kit | Low: no official design guidance found beyond "KPI cards in a grid", which is the pattern we are leaving |
| C1 | [`impeccable`](https://github.com/pbakaus/impeccable) (Paul Bakaus), files `SKILL.md`, `reference/craft-floor.md`, `reference/operate.md`, `reference/mode-operate.md` | The most developed community design skill; has an explicit **Operate** mode for dashboards | **High** |
| C2 | [`interface-design`](https://github.com/Dammyjay93/interface-design) (Dammyjay93) | Skill for dashboards and apps: hierarchy, depth, checks | **High** |
| C3 | [Uncodixfy](https://github.com/cyxzdev/Uncodixfy/blob/main/Uncodixfy.md) (published as `design-anti-patterns` on [skills.sh](https://skills.sh/jamie-bitflight/claude_skills/design-anti-patterns)) | Hard list of "AI dashboard" patterns | Medium: strong on anti-patterns, too absolute on headlines |
| C4 | [`design-taste-frontend`](https://tessl.io/registry/skills/github/popey/claude-code-skills/design-taste-frontend) (tessl registry) | Opinionated taste rules | Low: has the opposite views on serif and mono, noted in §3 |
| C5 | [`ui-ux-pro-max`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Searchable CSV database of styles, palettes, chart types, UX rules | Low–medium: one useful forecast-chart row |
| R1 | [Refactoring UI, "Labels are a last resort"](https://www.refactoringui.com/previews/labels-are-a-last-resort) | Tailwind authors' design book (free preview) | Medium |
| D1 | [Datawrapper, "What to consider when using text in data visualizations"](https://www.datawrapper.de/blog/text-in-data-visualizations) | Title, description, annotation and label rules | **High for chart titles** |
| D2 | [Datawrapper, "Fonts for data visualization"](https://www.datawrapper.de/blog/fonts-for-data-visualization) | Figures, weights, sizes | Medium |
| D3 | [Datawrapper, "Better charts"](https://www.datawrapper.de/blog/better-charts) | Headline-as-hypothesis, grey, labels | Medium |
| D4 | [IBM Carbon, Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/) and [Chart anatomy](https://carbondesignsystem.com/data-visualization/chart-anatomy/) | Enterprise design-system guidance for data-dense apps | High |
| D5 | [GitLab Pajamas, Charts](https://design.gitlab.com/data-visualization/charts) | Product-team chart rules | Medium |
| D6 | [Stephen Few, "Common Pitfalls in Dashboard Design"](https://www.perceptualedge.com/articles/Whitepapers/Common_Pitfalls.pdf) | The classic 13 pitfalls | Medium |
| D7 | [Claus Wilke, *Fundamentals of Data Visualization*, ch. 16](https://clauswilke.com/dataviz/visualizing-uncertainty.html) | How to show uncertainty | High for P10/P50/P90 |
| D8 | [CDC COVE, Forecast chart](https://www.cdc.gov/cove/data-visualization-types/forecast-chart.html) | Government forecast-chart template | Medium |
| D9 | [Apache ECharts handbook, ARIA](https://echarts.apache.org/handbook/en/best-practices/aria/) | Accessible descriptions and decal patterns in our chart library | Medium (implementation) |

Not found or not usable: an official Tremor design guide (only tutorials, e.g. [LogRocket](https://blog.logrocket.com/build-react-dashboard-tremor)); the Tailwind Plus shell catalogue (login wall); the Economist chart style guide (the PDF link now serves HTML). These gaps change none of the rules below.

---

## 2. What each source prescribes

Short quotes only. Rules that repeat across sources are merged in §4.

### A1. Anthropic `frontend-design`

- **Stance.** "Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined."
- **Ground it in the subject.** Distinctive choices come from "the subject's industry, subject matter, materials, and vernacular". It names "a dashboard for financial analysts" as an example of how the subject changes the look.
- **Hero.** "a big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option."
- **Type.** One or two families, clearly distinct; a set type scale; lines "less than 80 characters"; serif body gets more line-height.
- **Typographic tells to avoid.** Accenting one word in a headline; "Using all caps for labels"; "Adding unnecessary typographic labels above content."
- **Structure is information.** Numbered markers (01 / 02 / 03) only for real sequences.
- **Motion.** "A single orchestrated moment … lands better than scattered effects"; fade-and-slide on every section "read as AI-generated". Motion that answers a user action is welcome.
- **The five AI-default clusters** (the calibration list). (1) warm cream near `#F4F1EA` with a serif display and terracotta accent; (2) near-black with one acid-green or vermilion accent; (3) **"a broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns"**; (4) the SaaS card kit: identical rounded cards, one radius, the same soft shadow, gradient washes; (5) template chrome: "a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots", "a monospace face for small data labels", "a '→' appended to link and button text".
- **The brief wins.** "Where the brief pins down a visual direction, follow it exactly." The list exists so free choices aren't spent on defaults.
- **Process.** Plan tokens first (4–6 named hex colours, type roles, layout in ASCII), review the plan against the brief, then build; check screenshots; "remove one accessory".
- **Copy.** Write from the user's side; active voice; an action keeps one name through the flow; errors say what happened and how to fix it.

### A2, A3. Anthropic artifacts skill and blog

- A2: "avoid using excessive centered layouts, purple gradients, uniform rounded corners, and Inter font."
- A3 explains the cause as distributional convergence: "Safe design choices … dominate web training data." Its advice: "Dominant colors with sharp accents outperform timid, evenly-distributed palettes"; avoid "purple gradients on white". It recommends one staggered page-load moment. For a working dashboard, C1 and C2 overrule that (§3).

### A4, A5. Anthropic knowledge-work data skills

- A4 chart rules: "Title states the insight: 'Revenue grew 23% YoY' beats 'Revenue by Month'"; subtitle carries date range, filters, source; highlight the story in one accent and grey the rest; sort by value unless the order is natural; time series wider than tall (3:1 to 2:1); bars start at zero; consistent scales across panels; "Show uncertainty"; never 3D; pie only under 6 categories; never rotate axis labels when avoidable.
- A5 is a **counter-example**. Its template asks for "Card-based layout with subtle shadows" and a 4-card KPI row under the title. That is the "generic admin template" the owner rejected. Don't use it as a model.

### L1. Local skill `dataviz` (the chart authority)

- **Procedure.** Pick the form first and colour last; validate the palette by script; apply mark specs; add the hover layer by default; do an accessibility pass; render and look.
- **Form.** A single current value is a stat tile or hero figure, never a one-bar chart. **Emphasis** (one series in the accent, the rest grey) is "the most underused form". Part-to-whole uses bars, not donuts.
- **Non-negotiables.** No dual axis ("the #1 chart mistake"); colour follows the entity, never its rank; sequential is one hue light→dark; diverging is two hues plus a grey midpoint; status colours are reserved and always come with an icon and label; "Text wears text tokens, never the series color."
- **Marks.** Bars ≤ 24 px with a rounded data end and a square baseline; 2 px lines; markers ≥ 8 px with a 2 px surface ring; area fill about 10 %; gridlines solid 1 px hairlines, never dashed ("Dashing … reads as 'projection'").
- **Labels.** A legend for two or more series, plus selective direct labels (endpoint, extreme, the series that matters), never a number on every point. Colliding end labels get leader lines or small multiples, not nudges.
- **Hero figure.** Exactly one per view, ≥ 48 px, in the interface sans ("never a display or serif face"), with proportional figures. `tabular-nums` only where numbers align in columns.
- **Interaction.** A crosshair snaps to X; one tooltip lists every series, value first, keyed with short line strokes; hit targets ≥ 24 px; filters in one row above everything they scope; on refetch, "charts hold their previous render at reduced opacity - no skeleton".
- **Anti-pattern catalogue.** Also lists chart containers whose fixed height cuts off the x-axis band, labels clipped inside bars, and tooltips as the only way to read a value.

### L2. Local skill `artifact-design`

- Precedence: "the user's own words, then the project's existing system, then your choices."
- Include "at least one detail only this subject would have (its real units and scales, its document conventions, its terms of art)."
- Neutrals tinted toward the accent; design both themes, each chosen rather than inverted; `color-scheme: dark` in dark.
- "Use card styling selectively … applying the same radius and shadow to every block flattens the hierarchy. Open with big-number tiles only when those figures are the point of the page."
- Dashboards: "Put the summary before the detail. Encode state in form as well as in numbers"; semantic colour is separate from the accent; "Interactive elements should look interactive."
- It repeats the AI-look list (cream + serif + terracotta; "broadsheet hairline rules with dense columns"; `rounded-lg` everywhere; accent rail on rounded cards). Again: "When the user specifies a visual direction, follow it exactly."
- Copy: no mannered devices ("not X, but Y", colon-then-reveal, stock phrases); short, direct sentences.

### V1, V2. Vercel Web Interface Guidelines

- **Interactions.** "Keyboard works everywhere"; visible `:focus-visible` rings; hit targets ≥ 24 px (44 px on mobile); "URL as state"; "Deep-link everything. Filters, tabs, pagination, expanded panels"; links are `<a>`; polite `aria-live` for async updates; tooltip delay only on the first tooltip in a group.
- **Animation.** Honour `prefers-reduced-motion`; animate `transform` and `opacity` only; "Never `transition: all`"; animate only to clarify cause and effect; interruptible.
- **Layout.** Deliberate and optical alignment; verify on mobile, laptop and ultra-wide; no stray scrollbars; let CSS size things.
- **Content.** "Inline help first … tooltips as a last resort"; "All states designed. Empty, sparse, dense, & error states"; skeletons that match the final layout; tabular numbers for comparisons; "Don't rely on color alone"; `…` not `...`; curly quotes; non-breaking spaces in `10 MB`; `Intl.NumberFormat` and `Intl.DateTimeFormat`; `text-wrap: balance` on headings.
- **Design.** Layered shadows; nested radii that are concentric; "Accessible charts. Use color-blind-friendly palettes"; APCA contrast; hover, active and focus states have more contrast than rest; `color-scheme: dark`; `theme-color` matches the page.
- **Copy (Vercel brand, not universal).** Active voice; numerals for counts; specific button labels; errors that guide the exit. Vercel's Title Case rule conflicts with our sentence case; ours wins (spec §3.5).
- **Review anti-patterns** (command.md): `transition: all`, `outline-none` without a replacement, `<div onClick>`, form inputs without labels, hardcoded date and number formats, icon buttons without `aria-label`.

### V3. Vercel React best practices (what applies to a static Vite SPA)

`bundle-dynamic-imports` (load heavy views and ECharts parts per route), `bundle-barrel-imports`, `rerender-memo` and `rerender-derived-state-no-effect` (derive chart options in render, not effects), `rerender-transitions` / `rerender-use-deferred-value` (filter changes as non-urgent updates), `rendering-content-visibility` for long ledgers, `js-index-maps` for lookups over 3,093 series. The server-side rules don't apply.

### S1, S2. shadcn/ui

- "Use semantic colors … never raw values like `bg-blue-500`"; no raw colours for status ("`text-emerald-600` +20.1%" is wrong); "No `space-x-*` or `space-y-*`. Use `flex` with `gap-*`"; no manual dark overrides; `Separator`, `Skeleton`, `Badge` and `Empty` instead of ad-hoc markup. Its recipe "Dashboard = Sidebar + Card + Chart + Table" is the generic composition we deliberately depart from.
- Charts: colours as CSS variables (`--chart-1…`), separate light and dark values; the container needs an explicit height or `min-h`; horizontal grid only (`vertical={false}`); tooltip indicators may be `line`; an `accessibilityLayer` for keyboard access.

### T1, T2. Tailwind shells and Tremor

- Catalyst's `SidebarLayout` "moves the sidebar into a collapsible mobile menu on smaller screens". `StackedLayout` is "a great fit for apps with fewer pages". Multi-column shells suit inbox-like screens. That matches our rail + main column, and an inbox ledger + case drawer.
- Tremor material only confirms the default "KPI cards, charts and tables inside cards" grid. No rules worth adopting.

### C1. `impeccable` (Operate mode is the part that applies to dashboards)

- **Modes.** "On Operate and Read, ambition shows as precision and restraint." Operate = "App UI, dashboards … Scanability, consistency, native expectations … outrank expression. Brand lives in precise details."
- **The key limit for us.** "The world lends four things and only these: type, palette, density, and one signature move. It never supplies the layout, the navigation model, or the controls." A comp must never "read as a newspaper, a poster, or any other artifact of the world". It warns against "ruled ledger paper standing in for a table". It also says "A grey screen with one accent colour is the category default without the category's polish, not restraint."
- **Craft floor (verify).** Body text ≥ 4.5:1; more space above a heading than below it; body measure 65–75ch; tracking floor −0.04em; all states; theme the "browser surfaces" (selection, caret, scrollbars, focus rings, underline offset, numerals in tables), "the one models skip most reliably".
- **Refuse.** Same-size icon + heading + text cards as page structure ("nested cards are always wrong"); "The hero-metric template: big number, small label, supporting stats, accent"; **"A kicker or eyebrow above a heading. This one is a ban"**; section numbers; gradient text; decorative glass; a side bar on a rounded box; "Sparklines, progress rings … standing in for content"; "Monospace as a costume for 'technical' rather than for code, data, or measurement"; emoji or Unicode glyphs as an icon system.
- **Operate depth.** One family is often enough; fixed rem scale with a ratio of 1.125–1.2; motion 150–250 ms that "conveys state, not decoration"; "No orchestrated page-load sequences"; every component has default, hover, focus, active, disabled, loading and error states; empty states that teach; overlays escape their containers; "Modal as first thought" is laziness.

### C2. `interface-design`

- "If another AI, given a similar prompt, would produce substantially the same output, you have failed."
- **One focal point per view.** "Name the focal element out loud. Then make it win."
- **Weight beats size.** Hierarchy from size, weight and colour together. Use 4 text levels (primary, secondary, tertiary, muted). Example of a decided metric: label 11/500/muted, value 28/600/primary, delta 12/500.
- **Density is a decision expressed in px; breathe unevenly.** Tight groups, real air between groups; "Monotone layouts — same card size, same gap … are the sound of no one deciding."
- **Restraint.** About 60/30/10 neutral / secondary / accent; "One accent, used with intention"; "Hierarchy through space and weight, not lines."
- **Depth.** Choose one strategy and commit (borders-only, subtle shadows, layered shadows, or surface shifts); "Don't mix strategies"; sidebars use the same background as the canvas with a subtle border.
- **Tokens evoke a world.** "`--ink` and `--parchment` evoke a world; `--gray-700` and `--surface-2` evoke a template."
- **Checks.** Swap test (swap the typeface or layout for the usual one: does anything change?), squint test, signature test ("point to five specific elements where your signature appears"), token test.
- **Avoid.** Harsh borders, flat hierarchy, monotone layout, mixed depth, missing states, decorative gradients, multiple accents, system or Inter fonts where a direction was set.

### C3. Uncodixfy (`design-anti-patterns`)

- Names the "Codex UI" look: "soft gradients, floating panels, eyebrow labels, decorative copy, hero sections in dashboards, oversized rounded corners, transform animations, dramatic shadows".
- **Hard no**, the items that apply to us: "No metric-card grid as the first instinct"; "No fake charts that exist only to fill space"; "No 'hero section' inside an internal UI"; "No serif headline + system sans fallback combo as a shortcut to 'premium'"; eyebrow labels ("'MARCH SNAPSHOT' uppercase with letter-spacing"); "Decorative copy like 'Operational clarity without the clutter'"; "Section notes and mini-notes everywhere explaining what the UI does"; "Tables with tag badges for every status"; "Footer lines with meta information" joined by bullets; "Trend indicators with colored text"; `translateX` hover nudges.
- "Normal" standards: sidebar 240–260 px with a solid background and a border; tabs with a simple underline; 1 px borders; 100–200 ms transitions; content max width 1200–1400 px.
- It goes too far for us with "No Headlines of any sort". What it bans is decorative headline copy; §3 explains why our computed headlines pass.

### C4, C5. `design-taste-frontend` and `ui-ux-pro-max`

- C4: "Serif fonts are strictly BANNED for Dashboard/Software UIs"; "No card boxes; just 1px lines to separate data"; "Use Monospace (`font-mono`) for all numbers"; the "3 equal cards horizontally" row is banned. We follow its card rule and reject its serif and mono rules (§3).
- C5's "Time-Series Forecast" row: "Use solid actual and dashed forecast lines, direct labels, and a named confidence range; hue alone is insufficient". Forecast horizon "≤ 30% of visible x-axis range". Provide a visible forecast table and an uncertainty summary.

### R1. Refactoring UI

"Labels are a last resort": the `label: value` format "makes it difficult to present the data with any sort of hierarchy". Combine label and value ("12 left in stock"). On dashboards, keep labels but "De-emphasize the label by making it smaller, reducing the contrast, using a lighter font weight".

### D1–D3. Datawrapper

- "Give the main statement first and the precise data explanation later." The title states the takeaway in plain words; the description holds what is measured, the period and the scope, smaller than the title.
- "Remove the color key and directly label your categories." Labels go next to their marks; repeat units in axis, tooltip and annotation; compact formats ("20m"); tooltips name the category as well as the number.
- "use only two levels of hierarchy that are clearly different from each other" inside annotations; left-align longer text; avoid rotated axis labels; outline text that sits over gridlines.
- Fonts: sans for most chart text, serif acceptable for headlines; lining figures everywhere; tabular figures in tables and most chart labels; bold only for titles and a few words; nothing under 12 px; uppercase sparingly, smaller and letter-spaced.
- "Headlines are our hypotheses." "Grey is the most important color in data vis." "Every visual element that represents data needs to be labeled somehow." Add a comparison so readers can tell high from low; always cite the source.

### D4, D5. IBM Carbon and GitLab Pajamas

- Carbon dashboards: "Prioritize data by importance, then create a clear visual hierarchy"; key content top-left, read left→right, top→bottom; "Non-essential information should be provided as needed"; "Always use consistent colors for each data set within a dashboard"; linked charts update together; "All charts should use the same layout and spacing, and have legends in the same position"; annotate trends, peaks and valleys.
- Carbon chart anatomy: "The title … should be descriptive and qualitative" and reflect the main insight; "use labels directly on the chart to avoid long legends"; "Avoid filling the chart frame with too many elements"; tooltips repeat both axis values.
- Pajamas: a legend whenever a chart has more than one series; legend chips mirror the mark; about five values per dimension in combined charts; add a zoom bar only when data overflows the container. Pajamas allows dual y-axes; `dataviz` forbids them, and we follow `dataviz`.

### D6. Stephen Few, 13 pitfalls

A dashboard is "a visual display of the most important information needed to achieve one or more objectives, consolidated and arranged on a single screen so the information can be monitored at a glance." The pitfalls: exceeding one screen; inadequate context for the data; excessive detail or precision; expressing measures indirectly; inappropriate display media; meaningless variety; poorly designed display media; inaccurate quantitative encoding; poor arrangement; ineffective highlighting of what matters; useless decoration; misused or overused colour; an unappealing display.

### D7–D9. Uncertainty, forecasts, accessibility in ECharts

- Wilke: always say what an interval represents, because "It is easy for readers to be confused about what an error bar represents". Graded intervals (lighter = wider, less certain) reduce "deterministic construal" errors, where readers treat bounds as hard limits.
- Forecast-chart conventions: history and forecast separated by a marked divider, with the forecast period labelled. Bands are shaded sequentially from the same hue. Supporting text in title, description and legend ([CDC COVE](https://www.cdc.gov/cove/data-visualization-types/forecast-chart.html)). Interval values belong in the data table. The Bank of England's fan-chart research is summarised in [*Scientific American*](https://www.scientificamerican.com/article/how-to-get-better-at-embracing-unknowns/) and [Bank Underground](https://bankunderground.co.uk/2019/11/19/build-your-own-fancharts-in-r/).
- ECharts: the ARIA component builds an `aria-label` from title, series and data. For dense charts, write `aria.description` by hand. `aria.decal.show` adds patterns as a non-colour cue.

---

## 3. Where the sources disagree, and the call for this dashboard

The spec is the authoritative brief, and every source says a pinned brief wins (A1, L2, C1). The sources do show exactly where an editorial dashboard tips into "generated". Here is how to stay on the right side of each line.

| Topic | What the sources say | Call for Celeris |
|---|---|---|
| **Serif on a dashboard** | C4 bans serif in software UIs; C3 bans "serif headline + system sans" as a premium shortcut; A1 and L2 list cream + serif + terracotta as cluster 1; L1 bans serif on the hero figure; D2 accepts serif for headlines. | Source Serif 4 only for **computed sentences**: view headline, standfirst, brief, case-file title and action. Never for a number in a chart, figure, table or tooltip. The hero figure stays Plex Sans (spec §3.5 already does this). The paper is `#FBFBF9`, not cream; the accent is cobalt, not terracotta. That puts us outside cluster 1. |
| **Rules instead of boxes** | A1 and L2 list "broadsheet hairline rules … dense newspaper-like columns" as a default; C1 says a working screen must never read as a newspaper; C4 and C2 want lines or space instead of cards. | Keep "rules, not boxes", without the newspaper costume: one `--rule-strong` above each module and space for everything else (C2: "space and weight, not lines"). No multi-column justified text, no drop caps, no datelines or mastheads styled as a paper, and no zero radius on controls (spec keeps 6 px controls). Controls are standard web controls (C1). |
| **Headlines on a dashboard** | C3: "No Headlines of any sort" (its example is decorative copy). A4, D1, D3, D4: titles must state the insight. | A headline is allowed only if it is **computed from the bundle and contains a number and a verb**: "Demand eases 3.2 % over the next 19 months". If a sentence could be written without the data, delete it. Each template has a descriptive fallback (spec §7). No taglines, no "what this page does" notes. |
| **Uppercase eyebrows** | A1: a tell; C1: a ban "above a heading"; C3: banned; spec §3.5 allows eyebrows for section labels, brief lead-ins and the FORECAST zone label. | Keep uppercase **only where it labels a region of data or a navigation group**: the FORECAST zone label on charts and the four rail group names. Remove it from the brand subtitle ("PLANNING CONTROL TOWER"), the masthead ("HISTORY AND FORECAST"), filter field labels and any lead-in above a module title. Never put an eyebrow above a module conclusion title. |
| **Monospace** | A1: mono for small data labels is a tell; C1: mono as a costume; C4: mono for all numbers. | Plex Mono only for real codes: SKU IDs, Record_IDs, hashes, CLI commands, file paths. All numbers use Plex Sans: proportional in figures, tabular in columns, axes and tooltips. |
| **Middle-dot strings and trailing arrows** | A1: "meta strings joined with middle dots" and "→ appended to link text" are tells; C3: bullet-joined meta footers. Spec uses `PTC-002 · North America` and evidence links "Stock-outs & lost sales →". | Middle dot only between two fields of one identifier (series = SKU · region). Everywhere else use a line break, a comma or two lines (rail footer, captions, deks). Evidence links: write them as plain underlined link text naming the destination ("See stock-outs and lost sales"), or keep the arrow on that one link type only. Never put an arrow on buttons. |
| **Hero metric** | A1 and C1: big number + small label + supporting stats is the default template; L1: exactly one hero figure per view; C3: no metric-card grid. | One hero figure per view, and it must carry the **range strip** (P10–P90 band, P50 tick, last-19-month reference). That signature makes it ours rather than the template. The supporting figures sit in one hairline-divided strip, each with a job-specific inline visual (sparkline, benchmark ladder, meter) that carries real data, never decoration (C1). No KPI tile row anywhere. |
| **Forecast encoding** | C5: solid actual + dashed forecast, "hue alone is insufficient"; L1: dashes read as projection; spec: ink history, cobalt forecast, forecast-zone wash, vertical rule at the last actual, FORECAST label. | Keep ink/cobalt, but the forecast must stay identifiable **in grayscale**: the wash, the divider rule, the zone label and the band do that. Never dash a historical series (the old orange dashed "unconstrained demand" must not come back). Use dashes only for projections and scenarios. Keep the forecast horizon ≤ 30 % of the default x-range (19 of about 112 months is about 17 %). |
| **Legend vs direct labels** | D1: remove the key, label directly; L1: legend always for ≥ 2 series plus selective direct labels; D4: direct labels to avoid long legends. | An inline key directly under the dek (spec §5.4), plus direct end labels and annotations on the data. No legend box away from the chart; no key with more than about 5 entries (fold or facet). |
| **Load motion** | A1 and A3: one orchestrated page-load moment; C1 Operate and C2: no page-load sequences in product UI. | No load animation and no count-up numbers (spec §3.6). Motion only answers an action: 150–200 ms, transform and opacity; filter changes hold the previous chart at 60 % opacity, then cross-fade. |
| **Dual axis** | D5 allows it; L1: never. | Never. Macro lead/lag uses an index (= 100) on one axis or two stacked charts sharing the x-axis. |
| **Delta colour** | S1: status through semantic tokens; L1: colour = direction × whether up is good; C3: coloured trend text is a tell. | Demand up or down is neither good nor bad: ink arrow and ink number (spec §5.2). Status colour only where the meaning is evaluative: lost sales, revenue at risk, failed checks, act-now exceptions. Always with a word or icon. |
| **Theme** | A3: vary light and dark; C1: pick from the use scene. | Light is primary: the jury sees it on a laptop or projector. Dark is a selected palette (spec §3.1, §6.6), never an inversion. |
| **Tooltips vs inline help** | V1: inline help first; spec uses an (i) popover per module. | The dek states units, scope and period inline. The (i) popover holds method detail only. Nothing a judge needs is hidden behind hover. |

---

## 4. The merged rule set, ordered by impact for this dashboard

Each rule cites its sources. Tier 1 is what changes the owner's "it looks bad" verdict; tier 4 is hygiene a technical judge may check.

### Tier 1: stop looking like an admin template (largest visible gain)

1. **Every view opens with one computed message.** A serif headline (≤ 2 lines, ≤ 24ch) and a 2–3 line standfirst. Both come from bundle numbers through deterministic templates with a descriptive fallback, and both re-render on every filter change. No decorative copy, no taglines, no notes explaining the UI. *(A4, D1, D3, D4; C3 for what to ban; spec §5.1, §7)*
2. **One focal point per view.** Exactly one hero figure (Plex Sans 600, 54 px, proportional figures) with the range strip. Everything else is demoted by size, weight and colour. Name the focal element before building each view. *(C2, L1, A1; spec §5.2)*
3. **No card kit.** Modules are separated by one 1 px rule above each and by whitespace. Shadow and radius only on things that float (tooltip, popover, drawer, menu). No nested boxes, no equal white tiles, no KPI grid. One depth strategy. *(A1 cluster 4, L2, C1, C2, C3, C4; spec §2.5, §3.6)*
4. **One signature, used everywhere: ink is the past, cobalt is the future.** History lines and hero numbers in `--ink`; forecast line, band, zone wash, the rail's forecast key and the range strip in cobalt. Cobalt is never decoration and never a categorical series (slot 8 is reserved). Signature test: point to five places where it appears on every view. *(A1 "boldness in one place", C1 "one signature move", C2 signature test)*
5. **Every chart title states its conclusion; the dek says what is plotted.** Title template with a descriptive fallback, sans 600 17 px. Dek: units, scope, period, one line, `--ink-3`. Never type a number into a title by hand. *(A4, D1, D3, D4; spec §5.4)*
6. **Type hierarchy from three levers.** Size, weight and colour together; a fixed scale (spec §3.5 tokens only, no in-between sizes); four text levels (`--ink` … `--ink-4`); sentence case; `text-wrap: balance` on headings, `pretty` on standfirsts; standfirst ≤ 70ch; more space above a module title than below it. *(C2, C1, V1, A1)*
7. **Labels are secondary.** Combine label and value where it reads naturally ("6,961 cells repaired", not "History repaired: 6,961"). Where a label must exist, make it smaller, lighter and lower in contrast than the value. *(R1, C2)*
8. **Remove leftover "provisional" chrome.** The final forecast is integrated, so every provisional banner, pill, warning footnote and "stand-in" caption goes. A stale caveat on a final number costs trust in Quality of Insights. *(L2 "real content", C1 "product truth")*

### Tier 2: chart craft (clarity and honesty)

9. **Form before colour.** Single value → figure; trend → line; ranking → sorted horizontal bars; part-to-whole → bars or a tall segmented bar (≤ 6 parts); many series → small multiples or emphasis (one series in colour, the rest `--ink-4`). No pies or donuts for close values, no 3D, no dual axis. *(L1, A4, D6 #5/#8)*
10. **One continuous timeline.** History and forecast on one x-axis. A vertical rule at the last actual, labelled with its month. The forecast zone is washed and labelled FORECAST, so it stays readable in grayscale. P50 is the line; P10–P90 is a band named in the key and the tooltip. *(problem statement §5; C5, D7, D8; spec §6.2)*
11. **Say what the uncertainty is.** Write "P10–P90 range" wherever the band appears (key, tooltip, range strip, table). If two bands are drawn, the wider one is lighter. Never let a bound read as a hard limit. *(D7, D8)*
12. **Thin marks and quiet chrome.** 2 px lines; bars ≤ 24 px with a 2 px data-end radius and a square baseline; markers ≥ 8 px with a surface ring; area fills about 10 %; gridlines solid 1 px `--grid`; no chart borders or backgrounds; dashes only for projection or scenario. *(L1, A4)*
13. **Annotate instead of legend-hunting.** Name events on the data (COVID-19 lockdowns, semiconductor shortage, ERP migration, planned shutdowns) with a short leader line and a one-line consequence ("Demand falls to 51.4K in Apr 2020"). About 3–5 annotations per chart at most. Label the endpoint, the extreme, or the series that matters. Use leader lines when labels collide. *(D1, D3, D4, L1)*
14. **Colour is a fixed system.** Families keep their slot in every view and under every filter; never recolour by rank. Status colours are reserved for status and always paired with a word or icon. Text is never set in a series colour; the coloured mark beside it carries identity. *(L1, D4, V1, S1)*
15. **One tooltip per X, value first.** A crosshair snaps to the month; the tooltip lists every series (value 600 tabular, then the label in `--ink-3`) with short line keys, and repeats units and the interval. The same content appears on keyboard focus. Every value is also reachable in the module's table view. *(L1, D1, D4, V1)*
16. **Honest scales.** Bars start at zero. Small multiples share a y-scale unless marked "independent scales". Time series are wider than tall (about 3:1 to 2:1). Sort categories by value unless the order is natural (months, lifecycle stages). *(A4, D6 #8)*
17. **Numbers follow one style sheet.** Spec §3.5 compact rules (`6,961`, `51.4K`, `161K`, `2.61M`, `$2.35B`), a true minus `−`, a thin space before units, one decimal on percentages, months as "Oct 2026" (never ISO in reading text). Format through `Intl.NumberFormat` and `Intl.DateTimeFormat` helpers, never string concatenation. *(V1, D2, spec)*
18. **Figures vs columns.** Proportional figures for the hero and figure strip; `tabular-nums` for tables, axis ticks, tooltips and the range strip. *(L1, D2, V1)*

### Tier 3: shell and interaction (usability)

19. **A standard shell.** A rail of 232 px on the same paper family, with a hairline border. It reads as a table of contents in reading order (overview → what happened → what will happen → act), with a clear active state. Filters sit in one row above everything they scope. Standard controls only: buttons, segmented controls, selects or comboboxes, tabs with an underline. *(T1, C1, C3, L1 interaction)*
20. **URL is state.** Every filter, view, tab, range preset, unit toggle and open case lives in the hash; Back and Forward work; "Copy link" reproduces the exact screen. *(V1)*
21. **All states designed.** Loading holds the previous render at 60 % opacity, with no skeleton flash. Empty filter results say what is empty and how to widen the selection. Errors name the problem and the fix. Dense views (3,093 series) stay readable through ranking and virtualised lists. *(V1, L1, C1, A1 copy)*
22. **Keyboard and screen reader.** A 2 px cobalt focus ring with a 2 px offset on every interactive element. Table rows are focusable and Enter opens the case. Links are `<a>`. The skip link and the h1 (the computed headline) are in place. `aria-live="polite"` announces the new headline after a filter change. Each chart has ECharts ARIA on with a written `aria.description` (the title sentence) and a table-view twin. *(V1, L1, D9)*
23. **Motion only answers actions.** 150–200 ms, `cubic-bezier(.2,.7,.2,1)`, `transform`/`opacity` only, never `transition: all`. Popovers and drawers fade and slide 6 px. No hover nudges on nav links. `prefers-reduced-motion` turns motion off. *(V1, C1, C2, C3, spec §3.6)*
24. **Fit the jury's screen.** Check at 1440×900, 1280×720 (projector) and about 1100 px. No horizontal page scroll. Chart boxes include their axis band (no clipped ticks, no inner scrollbars). Content sets heights; the main measure stays at 1128 px. *(V1, L1, L2, D6 #1)*
25. **Theme the browser surfaces.** `::selection` in the accent wash, the scrollbar track in the paper family, the focus ring, link underline offset, caret colour, `color-scheme` per theme, and `<meta name="theme-color">` matching the paper. *(C1 craft floor, V1)*
26. **Dark mode is selected, not inverted.** Blue-black paper, re-stepped categorical slots validated against the dark surface, lighter grid steps, borders over shadows. *(L1, L2, C2, spec §3.1)*

### Tier 4: copy and engineering hygiene

27. **Plain, specific copy.** The planner's words, not the pipeline's: "rows rebuilt" rather than "cells imputed" unless the term is defined. Active voice; one name per action (a "Mark reviewed" button produces a "Reviewed" status). Numerals for counts; `…` and curly quotes; a non-breaking space between a figure and its unit (`2.61M units`). No em-dash asides, no "not X but Y". *(A1, L2, V1)*
28. **Mono and arrows by rule** (see §3): mono only for codes; arrows only on evidence links, never on buttons; middle dots only inside an identifier.
29. **Performance.** Lazy-load views and ECharts chart types per route; memoise chart option objects so a hover doesn't rebuild them; mark filter updates as transitions; `content-visibility: auto` on long ledgers; preload and subset the three font files (spec: serif about 60 kB after subsetting); no layout reads during render. *(V3, V1)*
30. **Every number on screen traces to the bundle.** Headline, standfirst, chart titles and annotations use the same formatter and the same source fields as the charts. If a template can't compute its number, it falls back to the descriptive title. It never shows a stale or typed number. *(project rule; A1 "Build with the brief's real content")*

---

## 5. Anti-patterns to remove

Each item is something the sources name explicitly and that the current or older dashboard screens show, or that a redesign tends to bring back. Where it applies, the screenshot cue says what to look for.

**Layout and chrome**

1. Equal white cards with the same radius and soft shadow around every module (A1 cluster 4, L2, C2, C3, C4). *Cue: shadowed rectangles in a grid.*
2. A row of 4–5 identical KPI tiles as the first thing under the title (A1, A5 as counter-example, C1, C3).
3. Cards inside cards, or a module box around a chart that already has a rule (C1).
4. Provisional banners, pills and "stand-in" footnotes now that the forecast is final (§4 rule 8).
5. Uppercase tracked labels above filter fields, above module titles, in the masthead and in the brand subtitle (A1, C1, C3). Keep only the FORECAST zone label and the rail group names.
6. Middle-dot meta strings in deks, captions and the rail footer, e.g. "All families · 3,093 series · Units" (A1, C3).
7. Decorative or explanatory copy: taglines, "this view shows…", or mini-notes under every module (C3, A1 copy).
8. A one-sided coloured bar or stripe on a rounded box to show state (C1, L2). Use a full tint, a pill with a word, or an icon.
9. Gradients, glass, glows or coloured shadows anywhere (A2, A3, C1, C2, C3).
10. A different control style per view: some segmented controls with pill backgrounds, some tabs with underlines, some buttons as text (C1 "inconsistent component vocabulary").

**Charts**

11. Descriptive chart titles that only name the measure ("Demand from history into the forecast · units per month") (A4, D1, D4).
12. Legends with 6+ entries above the plot, and colour-only event strips with no labels (D1, L1, D4).
13. A dashed line for a historical series; dashed gridlines (L1).
14. Dual-axis charts (L1, A4).
15. Pies or donuts for close values; a one-bar bar chart (L1, A4).
16. Recolouring families when a filter changes the series count (L1, D4).
17. Status red or green on neutral demand deltas, e.g. a red "−3.2 %" (L1, S1, C3).
18. A number printed on every point or bar (L1, A4).
19. The dataZoom slider under the main chart as default chrome; use range presets (2019–2028 / Since 2024 / Forecast window) instead (D5: zoom only when data overflows).
20. Rotated axis labels and ISO months (`2026-10`) in reading text (D1, A4, spec).
21. Tooltip-only values, and essential context hidden in (i) popovers (L1, V1).
22. Fixed-height chart containers that clip the x-axis or create an inner scrollbar (L1).
23. Sparklines or meters that decorate rather than carry a real series (C1, C3 "fake charts").

**Type, numbers and copy**

24. Monospace used for numbers or for "technical" flavour (A1, C1).
25. Serif used for any number, axis, tooltip or table cell (L1, C4).
26. A hyphen as minus, `...` instead of `…`, straight quotes, units glued to numbers (`2.6Munits`) or split across lines (V1).
27. `tabular-nums` on the hero figure; proportional digits in table columns (L1, D2).
28. Pipeline vocabulary in labels without explanation, and Title Case headings (L2, A1; spec sentence case).

**Interaction and code**

29. A skeleton or spinner flash on every filter change (L1, V1).
30. `transition: all`, `outline: none` without a replacement, `<div onClick>` used as a link or button, hover `translateX` nudges (V1, C3).
31. Count-up number animations or staggered section entrances on load (C1, C2, spec).
32. A theme that only inverts colours: the same saturated hues on near-black (L1, L2, spec P12).

---

## 6. QA checklist: 30 items to tick against screenshots

How to use it: take the screenshots listed in the header row of each group (Chrome headless, `--window-size=1440,900` unless stated). Tick an item only if the pass condition holds on **every** listed view. Items marked (i) need a second screenshot of an interaction state (hover, focus or filtered).

**A. First glance and hierarchy** (all 12 views, 1440×900, light)

- [ ] 1. **Squint test.** Blurred, each view shows one dominant element (the headline or the hero figure) and a clear reading order. No two elements compete at the same scale. *(C2, D4)*
- [ ] 2. **Computed headline.** The view opens with a serif headline of ≤ 2 lines containing at least one number and a verb, plus a standfirst of ≤ 3 lines. The headline changes when a filter changes (i). *(rule 1)*
- [ ] 3. **Exactly one hero figure** per view, in sans, ≥ 48 px, and on views with a forecast it carries the range strip with labelled P10–P90 and a reference. *(L1, spec §5.2)*
- [ ] 4. **No card kit.** No shadowed or bordered boxes around modules; separation is one rule above each module plus space. Shadows appear only on tooltips, popovers, menus and drawers. *(rule 3)*
- [ ] 5. **No KPI tile grid.** Supporting figures sit in one hairline-divided strip, each with label, value, one inline visual carrying data, one line of context and an evidence link. *(spec §5.3)*
- [ ] 6. **No stale caveats.** No "provisional", "stand-in" or "dev-only" text, pill or banner anywhere. *(rule 8)*
- [ ] 7. **Swap test.** Covering the "Celeris" name, the screen could only be this product: a forecast timeline with ink history and cobalt future, the range strip, mono SKU codes, and real event annotations. *(C2, L2 subject detail)*

**B. Typography and numbers** (overview, forecast, exception inbox, data download)

- [ ] 8. **Three type roles used correctly.** Serif only in sentences (headline, standfirst, brief, case title); sans for all interface text and every number; mono only on codes, IDs, hashes and paths. *(§3)*
- [ ] 9. **Scale discipline.** All visible text matches the spec token sizes; no near-duplicate sizes (e.g. 15 / 16 / 17 side by side). Module titles 17/600, deks 13 in `--ink-3`, axis 11.5. *(C2, spec §3.5)*
- [ ] 10. **Uppercase only where allowed.** Uppercase appears only on the FORECAST zone label and the rail group names: not on filter labels, module lead-ins, the masthead or the brand subtitle. *(§3)*
- [ ] 11. **Number style.** Compact formats per spec; true minus `−`; units with a space; months as "Oct 2026"; percentages with one decimal; no ISO dates in reading text; `…` not `...`. *(rule 17, V1)*
- [ ] 12. **Figures vs columns.** Table columns, tooltips and axis ticks align on tabular digits; the hero and figure-strip values use proportional digits. *(L1)*
- [ ] 13. **No middle-dot meta strings** outside identifiers, and no arrow on buttons. *(§3)*

**C. Charts** (overview, demand explorer, forecast and accuracy, macro, what-if, stock-outs; plus one hover (i))

- [ ] 14. **Conclusion titles.** Every chart title is a sentence stating a finding with a number from the bundle, or an explicit descriptive fallback. The dek gives units, scope and period. *(rule 5)*
- [ ] 15. **One continuous timeline.** History and forecast share one x-axis. A vertical rule marks the last actual with its month, and the forecast zone is washed and labelled. In a grayscale copy of the screenshot the forecast region is still obvious. *(rule 10)*
- [ ] 16. **Uncertainty named.** The band is labelled "P10–P90 range" in the key and the tooltip; P50 is the line; no unlabelled shading. *(rule 11)*
- [ ] 17. **Annotations over legends.** Key events are labelled on the data with leader lines; the inline key under the dek has ≤ 5 entries; no legend box away from the plot. *(rule 13)*
- [ ] 18. **Mark specs.** Lines 2 px, bars ≤ 24 px with a square baseline, solid hairline gridlines, no chart frame. No dashed historical series, no dual axis, no pie or donut comparing close values. *(rule 12, L1)*
- [ ] 19. **Colour system.** Families keep the same colour in every view and after filtering (compare a filtered screenshot (i)). Status colours appear only on evaluative items and always with a word or icon. No text is set in a series colour. *(rule 14)*
- [ ] 20. **Tooltip (i).** Hovering a month shows one tooltip listing every series, value first, with units and the P10–P90 values, and line keys rather than boxes. *(rule 15)*
- [ ] 21. **No clipping.** Axis labels, end labels and annotations are fully visible; no chart has an inner scrollbar; no label overlaps a line or another label. *(L1)*
- [ ] 22. **Honest scales.** Bars start at zero; small multiples share a scale or say they don't; ranked bars are sorted. *(rule 16)*

**D. Shell, interaction and states** (overview filtered to one family; exception inbox with the case drawer open; one keyboard-focus screenshot (i))

- [ ] 23. **Standard shell.** The rail reads as a table of contents in reading order with one clear active item. Filters sit in one row above the content. Controls look like standard controls and share one style across views. *(rule 19)*
- [ ] 24. **URL state (i).** After choosing a filter and a range preset, a fresh load of the copied URL reproduces the same screen. *(rule 20)*
- [ ] 25. **Focus visible (i).** Tabbing shows a 2 px cobalt ring with offset on rail links, filters, segmented controls, table rows and chart table toggles. Nothing is covered by the sticky header. *(rule 22)*
- [ ] 26. **Designed states (i).** A filter that leaves no series shows a designed empty state with a way out. During a filter change the previous chart stays visible, dimmed, with no skeleton flash. *(rule 21)*
- [ ] 27. **Projector size.** At 1280×720 there is no horizontal scroll, the headline and hero figure are visible above the fold, and no chart is clipped. *(rule 24)*

**E. Theme and finish** (overview and inbox in dark; any view zoomed to show a text selection)

- [ ] 28. **Dark is chosen, not inverted.** Blue-black paper, legible ink levels, re-stepped family colours, cobalt still clearly the future. No pure-white text glare, no saturated light-mode hues on dark. *(rule 26)*
- [ ] 29. **Browser surfaces themed.** Text selection, scrollbars and the focus ring use the palette; nothing shows default browser blue. *(rule 25)*
- [ ] 30. **Nothing generic left.** None of the A1 / C3 tells are visible: no gradients, glass, glows, emoji icons, Inter or system font, tracked eyebrows above headings, side-stripe cards, hover nudges or decorative copy. *(§5)*

---

## 7. How the local skills apply here

**`dataviz`** (local, loaded with the Skill tool). Its rules are the chart standard for this app, and spec §6 already follows them. The parts most likely to be broken during implementation:

- One axis, always.
- The palette validator: run `scripts/validate_palette.js` on the family palette in both modes before shipping. Spec §3.3 reports passing values; re-run it if any hex changes.
- A legend for ≥ 2 series plus selective direct labels.
- Text never in a series colour.
- A hero figure in sans with proportional digits.
- Tabular digits only in columns.
- Solid hairline grids.
- 2 px lines, ≤ 24 px bars.
- A crosshair tooltip listing all series, value first.
- Filters in one row above everything they scope.
- On refetch, hold the previous render.
- A table-view twin for every chart.
- Render the result and look at it.

**`artifact-design`** (local). Its publishing contract doesn't apply (this app isn't published as an Artifact). Its fundamentals do:

- The project's own system (the spec) outranks generic taste.
- At least one subject-only detail: units of automotive parts, SKU codes, real events.
- Neutrals tinted toward the accent.
- Both themes designed, with `color-scheme`.
- Flex and grid with `gap`, not margins.
- Cards only by role.
- Charts drawn to scale with labels on real values.
- Complete at rest (nothing waits at `opacity: 0`).
- Sentence-case, plain copy without mannered devices.
- The same AI-look list as A1, with the rule that a specified direction is followed exactly.

---

## 8. Source list

Anthropic
- https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md
- https://claude.com/blog/improving-frontend-design-through-skills
- https://github.com/anthropics/knowledge-work-plugins/blob/main/data/skills/data-visualization/SKILL.md
- https://github.com/anthropics/knowledge-work-plugins/blob/main/data/skills/build-dashboard/SKILL.md

Vercel
- https://github.com/vercel-labs/web-interface-guidelines (README.md, command.md)
- https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines
- https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices

shadcn/ui, Tailwind, Tremor
- https://github.com/shadcn-ui/ui/tree/main/skills/shadcn (SKILL.md, rules/styling.md, rules/composition.md)
- https://ui.shadcn.com/docs/components/chart
- https://tailwindcss.com/blog/2024-05-24-catalyst-application-layouts
- https://tailwindui.com/components/application-ui/application-shells/sidebar
- https://blog.logrocket.com/build-react-dashboard-tremor (Tremor: tutorial only)

Community skills
- https://github.com/pbakaus/impeccable (`.agent/skills/impeccable/SKILL.md`, `reference/craft-floor.md`, `reference/operate.md`, `reference/mode-operate.md`)
- https://github.com/Dammyjay93/interface-design (`.claude/skills/interface-design/SKILL.md`)
- https://github.com/cyxzdev/Uncodixfy/blob/main/Uncodixfy.md and https://skills.sh/jamie-bitflight/claude_skills/design-anti-patterns
- https://tessl.io/registry/skills/github/popey/claude-code-skills/design-taste-frontend
- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (`.claude/skills/ui-ux-pro-max/SKILL.md`, `data/charts.csv`)
- https://github.com/Leonxlnx/taste-skill (read; landing-page focused, not used)

Design guides and data-viz references
- https://www.refactoringui.com/previews/labels-are-a-last-resort
- https://www.datawrapper.de/blog/text-in-data-visualizations
- https://www.datawrapper.de/blog/fonts-for-data-visualization
- https://www.datawrapper.de/blog/better-charts
- https://carbondesignsystem.com/data-visualization/dashboards/
- https://carbondesignsystem.com/data-visualization/chart-anatomy/
- https://design.gitlab.com/data-visualization/charts
- https://www.perceptualedge.com/articles/Whitepapers/Common_Pitfalls.pdf
- https://clauswilke.com/dataviz/visualizing-uncertainty.html
- https://www.cdc.gov/cove/data-visualization-types/forecast-chart.html
- https://www.scientificamerican.com/article/how-to-get-better-at-embracing-unknowns/
- https://bankunderground.co.uk/2019/11/19/build-your-own-fancharts-in-r/
- https://echarts.apache.org/handbook/en/best-practices/aria/

Local skills: `dataviz` (SKILL.md and references: anti-patterns, marks-and-anatomy, interaction, choosing-a-form) and `artifact-design`, loaded through the Skill tool on 24 Nov 2026.

---

## 9. The team owner's skill: `dashboard-designer` (mandatory)

Source: `.claude/skills/dashboard-designer/SKILL.md` in this repository (community skill, MIT; supplied by the team owner on
24 Nov 2026 with the instruction to use it for the dashboard design). Read the file itself; this section says how each of
its rules applies to the Celeris control tower. Where it and the Editorial Precision design system agree — which is nearly
everywhere — follow both. Where they differ, the notes below say which wins and why.

### 9.1 Audience and archetype (skill step 1)

| View | Archetype in the skill | Who decides what |
|---|---|---|
| Executive overview | Strategic | Manager: is the 19-month outlook up or down, and what three things need attention |
| Forecast & accuracy, Macro lead/lag, What-if | Analytical | Analyst: can the forecast be trusted, what drives it, what if the economy moves |
| Demand explorer, Anomaly monitor, Data health, Stock-outs & lost sales, Lifecycle | Analytical / operational | Planner: what happened to this SKU, region, customer, and why |
| Exception inbox, Procurement plan | Operational | Planner: what to act on this cycle and how much to buy |
| Data download | Utility | Anyone: take the numbers away |

Every view must make its decision obvious: if a module does not help that decision, cut it or move it down.

### 9.2 KPI rules (skill step 2 and "KPI tiers")

- Level 1 (headline): **3–5 figures at most** on the Executive overview, the hero figure largest. Operational views may
  carry 8–12; analytical views are not capped but must still rank them.
- Every KPI is **actionable, timely, comparable and unambiguous**: each headline figure shows a comparison (against the
  last 19 months, a target, the noise floor, seasonal naive, the prior period) and its unit and definition are one
  click away. A number without a benchmark does not ship.
- Level 2 (supporting): 6–10 charts giving context (by family, region, channel, trend). Level 3: tables and drill-downs.

### 9.3 Layout and hierarchy (skill steps 3 and 4)

- F-pattern: the most important thing is top-left; detail goes lower and to the right. The computed headline and the hero
  figure sit at the top of every view; filters stay at the top and default to the most common view (everything selected).
- **At most 6–8 charts per screen; prefer fewer, larger charts.** Long views are fine, but one screenful must not show
  more than eight competing charts.
- Size carries importance: figure values 24–32 pt or larger for the hero, labels 10–12 pt, module titles 14–16 pt.
- **White space is 15–20 % of the area.** Do not fill every gap; do not leave half-empty panels either.

### 9.4 Colour (skill step 5) — reconciled with "ink is the past, cobalt is the future"

- **At most 4–5 colours on a screen.** Grey / ink is the default for context and history; strong colour is reserved for
  what matters. This matches the Editorial system exactly: ink for actuals, cobalt for the forecast.
- Status semantics follow the skill: green = good / on track, red = bad / alert, amber = caution — used **only** for
  status (exceptions, checks failing, bias direction, loss), never as decoration, and never red and green alone: pair
  them with an icon, label or position. Red loses force if overused.
- Blue is "primary data" in the skill; here blue (cobalt) means forecast, which is the primary data of a forecasting
  tool. Do not use blue for anything else.
- Palettes must be colour-blind safe and text contrast at least 4.5:1 in both themes.

### 9.5 Text, numbers and context

- **Titles are insights, not labels** ("Revenue up 12 %", not "Revenue") — already the Editorial system's rule; computed
  from data, never typed.
- Numbers are formatted to a readable precision ($1.2M, not $1,234,567.89); units always shown.
- **The date range is clearly labelled** on every time chart (history Jan 2019 – Oct 2026, forecast Nov 2026 – May 2028),
  and range controls are visible.
- **Data source and "data as of" are visible in a footer** on every view (pipeline version, last actual month, when the
  bundle was built) so a reader knows whether the data is stale.
- Label data directly on charts where possible instead of sending the reader to a legend. No pie chart with more than
  five segments: use a ranked bar.
- Show the trend with every snapshot value.

### 9.6 Interaction and devices

- Filters at the top; drill-down by click; the default view is the most common one.
- **Mobile / narrow screens:** stack charts vertically and show the top three figures first. The skill is explicit that a
  large share of dashboard views happen on tablets and phones, so the app must be usable at tablet width (768 px) and
  must not break at phone width (390 px), even though it is designed for laptop and desktop.
- No auto-refresh or motion that interrupts reading.

### 9.7 The `dashboard-designer` gate — tick for EVERY view before it ships

1. Passes the **5-second test**: after five seconds a stranger can say what the most important thing on the view is.
2. The view's decision and audience (9.1) are obvious from its headline.
3. The Executive overview has 3–5 headline figures; no view shows more than 8 charts on one screen.
4. The hero figure is top-left / top and visibly the largest element.
5. Every headline figure has a comparison value and a unit.
6. Every chart title states the insight.
7. No more than 4–5 colours on screen; grey / ink is the default; colour is consistent with every other view.
8. Red / green / amber appear only for status, and never as the only cue.
9. The date range is labelled on every time chart; history and forecast are distinguishable at a glance.
10. Filters are at the top and default to "all".
11. Numbers are formatted with sensible precision and units.
12. Data source and "data as of" are visible in the footer.
13. White space is about 15–20 %: neither cramped nor half-empty.
14. Data is labelled directly where possible; no legend-hunting; no pie with more than five segments.
15. Usable at 768 px (stacked) and not broken at 390 px; top three figures come first on narrow screens.
16. Contrast is at least 4.5:1 and the palette is colour-blind safe in both light and dark themes.

Not applicable here: the skill's BI-tool selection guide (step 6). The brief allows any tool, and a static React + ECharts
app was chosen so the demo has no server, no cold start and full control of the design.

---

## 11. UI/UX Pro Max — installed by the team owner, to be applied FIRST

The team owner installed the `ui-ux-pro-max` skill (`.claude/skills/ui-ux-pro-max/`) and said "use this first".
**Read `research/dashboard-skill-ui-ux-pro-max.md` before anything else in this file**: it records what the skill
recommends for this product (data-dense, drill-down analytics dashboard; its palette, typography and chart rules), how
each recommendation is adopted or reconciled with the Editorial Precision system, and an 18-point gate (accessibility,
interaction, responsive layout at 1440 / 1024 / 768 / 375 px, motion, style and charts) that every view must pass before
the other checklists. Load the skill with the Skill tool (`ui-ux-pro-max`) and query it for anything not covered.

---

## 10. The rest of the team owner's list

*This section sits after §11 because §11 was added while it was being researched. Nothing above was changed.*

Research note, 24 Nov 2026. This section covers what was still missing from the owner's list after §9:

- `kpi-dashboard-design` and `data-dashboard`;
- the Infrasity product-designer skills;
- the better-known TasteSkill;
- more of UI/UX Pro Max;
- the four observability skills.

Everything was read as text. Nothing was installed, and no command, script or hook in these skills was run. Several ship install commands, gate scripts or a Stop hook; all were ignored. Copies are in `research/scratch/dashboard-skills-extra/`. Colours follow the owner's override at the top of the file, so "forecast accent" means orange.

### 10.1 What was found

| Code | Skill (owner's name) | Where | What it is | Trust / relevance |
|---|---|---|---|---|
| K1 | `kpi-dashboard-design` | [wshobson/agents, business-analytics plugin](https://github.com/wshobson/agents/blob/main/plugins/business-analytics/skills/kpi-dashboard-design/SKILL.md) | KPI tiers by audience and update cadence, SMART KPIs, a summary → department → drill-down hierarchy, a do / don't list | Medium / medium. It is the most-mirrored version (skills.sh, tessl): generic and SaaS-flavoured. |
| K2 | same, long copy | [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills/blob/main/skills/kpi-dashboard-design/SKILL.md) | K1, plus layout sketches, department KPI catalogues, Streamlit code and an "implementation patterns" paragraph on metric definitions | Medium / medium. The definitions paragraph is the useful part. |
| DD1 | `data-dashboard` | [lionelsimai/claude-skills-collection](https://github.com/lionelsimai/claude-skills-collection/blob/main/skills/data-dashboard/SKILL.md) | A 2 KB file: purpose, audience, data source, 3–5 KPIs, update frequency, a fixed layout and a six-line checklist. It matches the owner's summary except drill-down, which comes from K1. | Low / low. It confirms §9, and its layout is the template we are leaving. |
| DD2 | `data-dashboard` (a different skill with the same name) | [plugin87/ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills/blob/main/.claude/skills/data-dashboard/SKILL.md) (3.2k stars, MIT) | Dense data screens: brief questions, band composition, domain-correctness checks, layout traps found by measuring | Medium-high / high for layout and data truth. Its kit, `npx` install and gate scripts were not used. |
| IN | Infrasity Product Designer Skills | [infrasity-labs/dev-gtm-claude-skills, `product-designers/`](https://github.com/infrasity-labs/dev-gtm-claude-skills/tree/main/product-designers) | A 99-skill bundle from a developer-marketing agency. Skills read: `critique-information-density`, `critique-visual-hierarchy`, `critique-composition`, `critique-typography`, `critique-color`, `critique-affordance`, `heuristic-evaluation`, `design-qa-checklist`, `handoff-spec`, `loading-states`, `information-architecture`, `data-visualization`. Its `interface-design` is byte-identical to §1 C2. | Low-medium / medium. These are short, generic rubrics, useful as a reviewer's method, with nothing dashboard-specific beyond C2. |
| TS | TasteSkill (`taste-skill`) | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (about 121k stars on 24 Nov 2026) | This is the better-known TasteSkill (details below the table). | Medium-high / **the highest in this batch**: measured and specific. A few rules are house taste, and the skill says so. |
| UU | UI/UX Pro Max, the rest of it | [nextlevelbuilder/ui-ux-pro-max-skill, `src/ui-ux-pro-max/data/`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/src/ui-ux-pro-max/data): `charts.csv`, `styles.csv`, `products.csv`, `ui-reasoning.csv`, `ux-guidelines.csv` | Now covered by §11 and `research/dashboard-skill-ui-ux-pro-max.md`; only rows that note lacks are used here. The copy installed in `.claude/skills/ui-ux-pro-max` carries older data (`charts.csv` is 7.7 KB there against 23.7 KB upstream). | Low-medium / medium |
| OB | grafana-dashboards, kibana-dashboards, AxiomHQ dashboarding, firecrawl-dashboard-reporting | See the list after the table. | Vendor dashboards and scraping | High trust (vendors) / low: general composition only (§10.4) |

More on TS. Its default skill is called `design-taste-frontend`, and §1 C4 is a mirror of its **v1**, which now lives in [taste-skill-classics](https://github.com/Leonxlnx/taste-skill-classics). The current version, 2.5.1, builds company websites only. The material that applies to dashboards is `references/app-screens.md` from v2.1.x ([tag v2.1.5](https://github.com/Leonxlnx/taste-skill/blob/v2.1.5/skills/taste-skill/references/app-screens.md)). Version 2.5.0 dropped it. Its rules come from measuring 23 real product screens and from four blind judging rounds.

OB sources:

- [wshobson grafana-dashboards](https://github.com/wshobson/agents/blob/main/plugins/observability-monitoring/skills/grafana-dashboards/SKILL.md)
- [grafana/skills dashboarding](https://github.com/grafana/skills/blob/main/skills/grafana-core/dashboarding/SKILL.md)
- [elastic kibana-dashboards](https://github.com/elastic/agent-skills/blob/main/skills/kibana/kibana-dashboards/SKILL.md) and [elastic dashboard-design.md](https://github.com/elastic/integration-skills/blob/main/skills/dashboard-guidelines/references/dashboard-design.md)
- [axiomhq axiom-build-dashboard](https://github.com/axiomhq/skills/tree/main/skills/axiom-build-dashboard): `SKILL.md`, `reference/design-playbook.md`, `reference/layout-recipes.md`
- [firecrawl-dashboard-reporting](https://github.com/firecrawl/firecrawl-workflows/blob/main/skills/firecrawl-dashboard-reporting/SKILL.md)

Not found:

- **Infrasity.** No Infrasity skill is literally called "product designer". The owner's entry is the `product-designers/` bundle. Its closest single skill, `ux-researcher-designer`, was not used.
- **`data-dashboard`.** There is no single canonical skill; both published skills with that name are covered.
- **AxiomHQ.** Its skill is now named `axiom-build-dashboard`; skills.sh still lists it as `building-dashboards`.

### 10.2 Rules not already in §4–9 or §11, translated for Celeris

**A. KPI scoping and the top row**

1. **Each headline figure has a written definition.** Store it next to the value in the bundle and show it in the figure's (i) popover. It covers what is counted (numerator and denominator), the unit, the period, the comparison period and the calendar. *(K2; K1 "Don't hide methodology")*
2. **Percentage points for rates, percent for levels.** WAPE, bias, fill rate and share change in pp ("WAPE −1.2 pp"). Demand changes in % ("−3.2 %"). One kind of figure never uses both. *(K2)*
3. **Undefined comparisons say so.** Growth from zero reads "new". When there is no prior period, show a short grey dash. A run of missing months is labelled "no data", never bridged into a "monthly" change. *(K2; TS §5, §11)*
4. **Every relative figure names its baseline in the same phrase.** Write "−3.2 % vs the last 19 months" or "18 % better than seasonal naive". A bare "+5" next to another figure reads as measured against that figure. *(TS §2.1)*
5. **One figure leads.** The hero answers the headline's sentence, and no other figure on the view is larger. Every other figure is at most 32 px, and the hero is at least 1.3× the next largest. *(TS §2.2, §5; DD2 "the one number that leads")*
6. **One figure, one place.** A strip value is not repeated in the module title below it or in a legend. If every strip cell maps one-to-one onto a module below, drop the strip and open each module with its own number. *(TS §5)*
7. **No vanity or pipeline counts in the Overview's top row.** "3,093 series modelled" and "245,548 grid cells" belong on Data health. The top row holds figures that drive a decision: the change in the outlook, accuracy against its benchmark, lost sales or revenue at risk, and open exceptions. *(K1 "Don't show vanity metrics"; IN critique-information-density)*
8. **Against a target, use a bullet, not a gauge.** Three or more figures with targets use a bar with a 1 px target tick; the spec's benchmark ladder already does this for accuracy. No dials and no red → green ramps. *(UU charts "Performance vs Target (Compact)"; TS §6.1)*

**B. Drill-down structure**

9. **Three levels, in one direction.**
   - Overview: the answer.
   - Analytical view: where the answer comes from.
   - Case or SKU drawer: the evidence (the series, its rebuilt rows, its events).

   Each level adds detail and repeats nothing from the level above. *(K1 hierarchy; AX "overview → drilldown → evidence"; GR)*
10. **Every "X is high" has a top-contributors table under it.** Sort it by the measure, put N and the sort in the title ("Top 10 SKUs by lost units"), and let each row open the drawer. *(AX "No drilldown path"; KB "Top 20 CVEs by count")*
11. **Context travels with a drill-down.**
    - Filters, range and unit stay as they were.
    - The drawer title says where you are ("Brakes / PTC-002 · North America").
    - Back or Escape returns to the same scroll position.
    - The open drawer is part of the URL.

    *(UU Drill-Down Analytics; IN information-architecture "wayfinding"; IN loading-states "maintain scroll position")*
12. **Counts appear only on queues that need action.** The noun must be clear ("Exceptions 12"), and the count is recomputed under the current filters. *(TS §3.2, §11)*

**C. Density and layout for a data app**

13. **Density is three settings moved together: row pitch, padding and type size.** Ledgers (Exception inbox, Procurement, Data download) are dense: 13 px text on 36–42 px rows. Never shrink the type while keeping the padding. Give dense blocks air, with more space between modules than inside them. *(TS §10; UU Data-Dense)*
14. **Spacing comes only from tokens** (`--gutter`, `--module-gap`, `--col-gap`), with no ad-hoc mix of 16, 20 and 24 px. Keep one left edge from the headline to the last row. Write the 12-column arithmetic in a CSS comment, and check that modules land on the edges of the measure. *(TS §4.1–4.2; IN critique-composition)*
15. **The item count sets the column count.** Don't use `repeat(auto-fit, …)` for primary bands, because it silently drops a column. Use a fixed `repeat(3, minmax(0, 1fr))` when the count is fixed, and let a lone module span the row. *(DD2 §2, §6; TS §4.2)*
16. **Modules in a row share a bottom edge.** A shorter module either keeps its own height (`align-items: start`) or pins only an action or a total to its foot, never a legend or a note. No blank band inside a module may exceed 40 px. Screenshot each row and look at the bottom edges. *(TS §4.2 `ragged-row`, `panel-void`; DD2 §6)*
17. **Narrow blocks don't span the page.** A table of 5 columns or fewer, or a list of 6 rows or fewer, stops at about 760 px and pairs with the next block. *(TS §4.2)*
18. **Bands of different shapes, not the stock order.** The stock order is a figure row, a big chart, two small charts, then a table. Instead, each block answers the view's next question, and a block that answers no question is deleted. *(TS §2.2; DD2 §2)*
19. **Rules don't multiply.** Use three line strengths only: the module rule, a lighter row rule and a darker control border. If a title rule, a table rule and a row rule stack up, drop one. *(IN critique-composition "competing horizontal rules"; TS §9.2)*
20. **Watch for the 10-column table.** If a table has more than about 7 columns, find the 3 that do the work. Move the rest to the drawer, or stack two measures in one cell. *(IN critique-information-density; TS §7.4)*

**D. Chart craft additions**

21. **Straight line segments.** Set ECharts `smooth: false`, because smoothing invents values between monthly totals. Set `showSymbol: false` so markers show only on hover, except markers that carry data (rebuilt rows, events). *(TS §6.4)*
22. **Axis discipline.**
    - 3–5 horizontal gridlines and no y-axis line.
    - 4–7 round y ticks, with the top tick above the maximum.
    - 4–8 flat x labels on one step.
    - Axis text never larger than the data labels.
    - No axis title that repeats the dek's unit.

    *(TS §6.3; KB "never repeat information across title, axes and labels")*
23. **State the period once per level.** Use a page-level range control or a per-module period, never both. *(TS §4.4)*
24. **A flat series with one event** gets at most two-thirds of the width and about 140 px of height. Alternatively, cap the range and label the off-scale peak. *(TS §6.1)*
25. **Short histories stay honest and small.** A cold-start SKU with only a few months doesn't get the largest plot with a lone dot in it. With fewer than 4 points, show figures instead of a line. *(TS §6.4; UU charts "fewer than 4 data points")*
26. **Volume limits.** Never draw thousands of lines. Above about 1,000 points, use ECharts `sampling: 'lttb'` or aggregate. With more than 15 categories, use a ranked table with search. *(UU charts, trend and comparison rows)*
27. **Anomalies show why they were flagged.** Draw the series' own baseline range behind the flagged points, so a reader sees the deviation and not just a red dot. The flags are also listed in a table that stays on screen. *(K1 rolling-baseline thresholds; UU "Anomaly Detection")*
28. **Threshold colour only on bounded metrics** (percentages and rates). Colour the value, never the background, with at most three bands and the cut-offs written in the popover. *(KB; GR "meaningful thresholds")*
29. **Lay out annotation labels after `document.fonts.ready`.** Put them in rows above the plot, with no leader line crossing another label. Laid out earlier, the labels move between loads. *(TS §6.4)*
30. **Date and score the forecast where it is shown.** The forecast view states the forecast origin ("actuals to Oct 2026") and puts a backtest accuracy figure beside the forecast, not only in the accuracy module. *(UU styles "Predictive Analytics": "Predictions dated", "Accuracy shown")*

**E. Tables** *(TS §7; DD2 §5)*

31. **Headers.**
    - Numeric headers are right-aligned, flush with their values.
    - Headers are 12 px, grey and in sentence case, with no fill band.
    - The sort glyph shows on the sorted column only.
    - Use `<caption>` and `scope`, and add `aria-sort` only where clicking really sorts.
32. **Cells.**
    - A missing value is a grey dash; a real zero is "0".
    - The sign goes in the text, not in colour.
    - Each row carries one status mark at most.
    - Pills are a pale tint with dark text of the same hue, and they never squeeze (`flex: none; white-space: nowrap`).
33. **The identity column (SKU, customer)** gets a third to a half of the width and is never the column that gets truncated. To save space, drop the prefix that every row shares.
34. **Row limits.** Overview lists stop at 4–6 rows with "View all" and the total. Full lists show the total above, keep the header in view and say "1–50 of 1,284". Don't paginate a short list.

**F. States, freshness and cadence**

35. **State the update cadence, and show no live chrome.** The data is monthly, so there is no "Live" dot, no auto-refresh and no "updated 3 min ago". Instead, one quiet line: "Monthly snapshot. Actuals to Oct 2026, built 24 Nov 2026." *(DD1 "update frequency"; K1 "match metric frequency"; TS §11; AX refresh matches the window)*
36. **First load and refetch behave differently.**
    - First load: draw the final layout with flat grey bars at each value's real size and show labels at once, with no shimmer and no layout shift.
    - Refetch: hold the previous render (§4 rule 21).

    This meets §11's gate item 9. *(TS §11; IN loading-states: under 100 ms show nothing, 100 ms–1 s change opacity only)*
37. **Errors stay inside the module that failed.** Say what failed and when the data was last good, and offer a Retry text button. No full-page banner. *(TS §11)*
38. **An emptied module keeps its title and frame**, with one sentence across its full width (`grid-column: 1 / -1`). An empty side module may show reference data instead: "No exceptions this cycle. Last cycle: 14, all reviewed." *(TS §11)*
39. **Red is a signal, not a texture.** At most one red mark per row or object. *(TS §11)*
40. **Compute or defer.** If a figure can't be computed for the current selection, its slot says so in one line: "Not available for a single customer: fewer than 12 months of orders". Never substitute a proxy number with a caveat. This extends §4 rule 30. *(AX "Compute or defer")*
41. **Assert data truth in the bundle build.**
    - P10 ≤ P50 ≤ P90.
    - Family and region parts sum to the total.
    - The hero equals the chart's total.
    - A fact shown twice comes from one variable.
    - A displayed delta is the difference of the displayed values.

    A mismatch a judge catches costs more trust than a missing module. *(TS §2.1; DD2 §4)*

**G. UX analysis and hand-off checks (for the critic)**

42. **Rate every finding for severity on Nielsen's 0–4 scale.** Ratings of 3–4 block the demo. At least two reviewers rate on their own before comparing. Walk each view twice: once as a cold judge (§9.7 item 1), once as a planner doing the view's job. *(IN heuristic-evaluation)*
43. **Review through four lenses, with one verdict each** (pass, minor or major), written as observation → problem → fix:
    - hierarchy: the entry point, eye flow, size steps of at least 1.5×, one emphasis zone;
    - density: cognitive load, priority, scanning, what is hidden until asked for;
    - composition: balance, whitespace, rhythm, grouping;
    - affordance: what looks clickable, states, one primary action.

    *(IN critique-*)*
44. **Non-text contrast of at least 3:1** for the focus ring, input and select borders, segmented-control edges, the active tab underline and the forecast line against the paper. Check that `forced-colors` mode keeps the focus ring and the band visible. *(IN critique-color)*
45. **No false affordances.** Nothing is underlined or set in the accent unless it is a link, and no action is available only on hover. *(IN critique-affordance)*
46. **QA against the spec, not from memory.** Check computed values in devtools, test at 200 % zoom, and file each bug as a pair of screenshots: spec and build. *(IN design-qa-checklist)*
47. **Test every view against an edge-case set:**
    - one intermittent SKU;
    - a cold-start SKU with under 12 months of history;
    - a filter with zero exceptions;
    - the longest family, region and customer names;
    - P10 = P50;
    - an all-zero series.

    Each headline template also declares its maximum length and its fallback. *(IN handoff-spec; TS §2.6)*

**H. Taste and anti-generic additions** *(TS, measured on 23 real product screens)*

48. **Colour goes on data, not on chrome.** On the median measured screen about 3 % of the pixels are coloured. The forecast accent stays on the forecast, the one active marker and the one primary action, which is also what the override says.
49. **The product has a face.** The wordmark and the current scope ("All families, all regions") are visible in the shell. Labels use the trade's words (backorder, lead time, lost units, cold start), never template nouns ("Items", "Records", "Status").
50. **One question, one finding, one job per view.** Write down the question, and put the finding in the headline or under the hero figure. The view's most frequent job (Mark reviewed, Export order, Copy link) is one click away on the first screen.
51. **Don't stamp a pattern.** Use the same chart pairing at most once per view; three module shapes in a row that look alike read as generated.

### 10.3 Conflicts and calls

| Topic | What the sources say | Call | Reason |
|---|---|---|---|
| Top-row count | K1: 5–7 KPIs (4–6 on an executive page). UU: 4–6 on an executive page. AX and KB: 8–12 panels on open. | §9 stands: 3–5 headline figures on the Overview, at most 6–8 charts per screen. | The owner's skill is mandatory and has the stricter rule. DD1 also says 3–5. |
| KPI arrangement | DD1: a top row of 3–5 KPI cards, a primary chart in the middle, a secondary chart bottom left, a table bottom right. K2: four tiles with emoji alerts. UU executive style: count-up numbers, 48 px KPIs, sparklines, a pulsing alert. | Keep the count, not the arrangement: one hero plus a strip of figures split by hairlines (§3, §4 rule 3). No tiles, emoji, pulse or count-up. | TS found icon tiles and KPI sparklines on none of 23 real screens. The stock order is the template tell, and §3 bans load motion. |
| Sparklines in the figure strip | §3 allows inline visuals chosen by the figure's job, sparklines included (built as `Sparkline`). TS: no sparklines on KPIs. C1: "sparklines standing in for content". | Tighten §3: no trend sparkline of a series already drawn on the same view. The range strip, ladder and meter stay. | Those three show something the number cannot; a duplicate trend is decoration. |
| Type size | TS: app titles 18–32 px, no figure at 48 px or more (warnings at 34 and 48 px: "reads as a landing page"). As built: a 38 px serif headline and a 54 px hero. | Keep the as-built sizes, but enforce the fold test (gate 17) and the 1.3× rule (gate 22). If the fold test fails at 1440×900, switch to the 32 px `.headline.long` size before cutting content. | The brief pins the direction, and only one element of each kind is that large. TS's evidence is about several big numbers on one screen. |
| Uppercase | §3 kept uppercase for the FORECAST label and the rail group names. As built, eyebrows also appear in the masthead and the drawer. TS: group labels in sentence case, at most one tracked uppercase label per screen. | Set rail group names and the masthead and drawer eyebrows in sentence case, 12–13 px, muted. The FORECAST zone label is the only uppercase label, so §6 item 10 now reads "only the FORECAST label". | A1, C1, C3 and TS all point the same way, and the change is a token edit. |
| Black nav band on cream (colour override) | TS: none of the 17 light screens it measured has a dark sidebar on a light canvas, and that sidebar is tell #1 of generated dashboards. | The override stands, but the band has to recede: <br>• one flat black <br>• no filled active pill: the active item is chalk text plus the small orange marker <br>• sentence-case group labels in `#a39d90` <br>• grey outline icons, or none <br>• nothing else in black except the footer band | An explicit owner instruction beats a measured preference. The tell is a loud band that competes with the data. |
| Cream, serif and orange (colour override) | A1 cluster 1: cream, a serif display face and terracotta. A1 cluster 2: near-black with a vermilion accent. TS bans "cream with terracotta". | The override stands. Keep out of those clusters through discipline: <br>• one flat cream ground: no cream-on-cream cards, no paper texture <br>• no brown or terracotta secondary colours <br>• orange used only as in item 48 <br>• serif only on computed sentences | The sources object to the default look worn for no reason. Ours is earned by the data rule: ink for the past, orange for the future. |
| Amber "caution" vs orange forecast | §9.4: amber means caution. The override: orange means the future. | No amber or orange status colour. Caution is ink with an icon and a word. Bad is `#c93636` with an icon; good is `#087a08` with an icon. | An amber warning next to an orange forecast would make the forecast read as an alert. |
| Forecast line style | TS and UU: draw the forecast dashed. | §3 stands: colour, wash, divider and label, readable in grayscale. TS's "label the end value" is already §4 rule 13. | Settled in §3. |
| Loading | IN loading-states: shimmer skeletons and a 30–50 ms stagger on lists. §11 gate item 9: "skeleton or spinner". | Rule 36: on first load, flat bars at real size with no shimmer and no stagger; on refetch, hold the previous render. | This follows TS and §4 rule 21, and still meets §11's "never frozen, space reserved". |
| Dense spacing | UU Data-Dense: 8 px gaps, 12 px padding and 36 px rows everywhere. | Dense rows in ledgers only. Page gutters and module gaps stay as built. | The densest real screen TS measured surrounds its dense rows with generous space. |
| Dates in tables | TS: ISO dates, right-aligned, wherever rows are compared. | Keep "Oct 2026" in the UI (§4 rule 17). ISO only in CSV downloads. | The UI keeps one date style, and the fixed-width form lines up with tabular digits. |
| Tables on phones | DD2: drop the columns a phone can lose. TS: move fields to a second line, never drop them. | Follow TS below 640 px; drop only derived or decorative columns. | Judges may open a narrow screen, and data should not disappear (§9.6). |
| Editorial style | UU `styles.csv`: "Editorial Grid / Magazine" is marked "do not use for dashboards, apps". | This agrees with §3. Editorial Precision is a type system, not that style: no drop caps, pull quotes, magazine grid, reveal-on-scroll or parallax. | This is the fifth source warning against dressing the dashboard up as a newspaper. |
| Glass filter bar | The spec: a translucent sticky filter bar with backdrop blur. TS and C1 ban backdrop blur and glass. | Make it opaque, in the paper colour, with a bottom hairline. | One less tell, and contrast doesn't change while scrolling. |
| Motion | taste v1 (C4) "Bento 2.0": every card loops an animation so the dashboard "feels alive". | Rejected. | §3 motion row; C1 Operate; TS: "nothing performs an entrance". |

### 10.4 The observability skills: what transfers

These skills target Grafana, Kibana, Axiom and web scraping. Their query languages (PromQL, ES|QL, APL), JSON schemas, provisioning, APIs and CLI scripts don't apply. These composition rules do:

- **Row order: summary figures, then trends, then breakdown tables, then raw records.** Grafana, Kibana and Axiom all use this order ("notice → narrow → verify"). For us it is headline and hero → timeline → change or top-N table → ledger and drawer.
- **Vital signs first, in a fixed order.** The monitoring tools' "golden signals" (errors, then latency, then traffic, then saturation) translate to: choose the Overview's few vital figures once, and keep them in the same order on every overview-type view.
- **No decision, no panel; one question per panel** (AX). Titles carry their units ("Lost units", "WAPE (%)"), and axis titles don't repeat them (KB).
- **Percentiles over averages** (AX). Where accuracy is summarised across series, show the median and the 90th percentile next to the portfolio figure, because an average hides the bad tail.
- **Threshold colour** goes on the value, for bounded metrics only, with at most three bands (KB, GR); this is rule 28.
- **Time-range conventions.**
  - One page-level range.
  - Time bins that give 50–200 points per series; our ~112 months fits.
  - Refresh rate matched to the time window (AX).
  - Drill-down links carry the range and filters (GR `${__from}`; AX puts the comparison period in the URL with `?t_against=`).
- **Compute or defer** (AX): rule 40.
- **No pixel-only numbers.** Firecrawl's report format asks for every metric as value, unit, change, period and source, and it flags "chart-only data". This maps onto our existing table-twin rule: no number on the dashboard may exist only as pixels.

### 10.5 Additional gate items (17–28)

Use these like §9.7: tick each one for every view, on 1440×900 light-theme screenshots. Items marked (i) also need a screenshot of an interaction.

17. **Fold test.** At 1440×900 these are all visible: the headline, the standfirst, the hero with its range strip, and the title plus the top of the plot of the first chart. Lists on overview-type views stop at 4–6 rows with "View all" and a total. *(TS §2.2)*
18. **Question, finding, job.** The view's most pressing number is in the headline or under the hero figure. The control for the view's main job is visible without scrolling. *(TS §2.2; §9.1)*
19. **Deltas say against what.**
    - Every change names its baseline in words.
    - Rate changes are in pp and level changes in %.
    - A change from zero reads "new"; a grey dash shows where there is nothing to compare.
    - Colour appears only on metrics with a good direction, on the number, never on a tile.

    *(K2, TS §5)*
20. **Facts agree.** Recompute from the screenshot:
    - a figure shown twice has the same value and rounding;
    - the parts shown sum to the total shown, or a rounding note is present;
    - P10 ≤ P50 ≤ P90 in every tooltip and table;
    - no NaN, ∞, −0 or "undefined" appears anywhere.

    *(TS §2.1, DD2 §4)*
21. **Rows end level.**
    - Modules that share a row end within 8 px of each other.
    - No blank band inside a module exceeds 40 px.
    - No grid cell is left orphaned.
    - No table of 5 columns or fewer, and no list of 6 rows or fewer, stretches across the full measure.

    *(TS §4.2, DD2 §6)*
22. **One big number.**
    - Only the hero is 40 px or larger, and it is at least 1.3× every other figure.
    - No strip cell carries a trend sparkline of a series charted on the same view.
    - No strip value is simply repeated in the module title below it.

    *(TS §5; §10.3)*
23. **Tables are rules and alignment.**
    - Numeric columns and their headers are right-aligned.
    - Headers are grey sentence case with no fill band, and there is no zebra striping.
    - A sort glyph shows only on the sorted column.
    - A missing value is a grey dash and a zero is "0".
    - The identity column is never the one truncated.
    - Each row has one status mark at most.
    - Top-N tables name N and the sort in the title.

    *(TS §7, KB, AX)*
24. **Drill-down keeps context (i).**
    - Opening a SKU or a case keeps the filters, range and unit.
    - The drawer title says where you are.
    - Back or Escape returns to the same scroll position.
    - Reloading the URL reopens the drawer.

    *(UU, IN information-architecture)*
25. **Forecast dated and scored.** Wherever the forecast is the main chart, the forecast origin (the last actual month) and a backtest accuracy figure sit next to it. Anomaly flags have a shape and a text label, and they also appear in a visible list. *(UU "Predictive Analytics", "Anomaly Detection")*
26. **Chart chrome.**
    - 3–5 horizontal gridlines and no y-axis line.
    - Round y ticks, with the top tick above the maximum.
    - 4–8 flat x labels.
    - Straight line segments.
    - No axis title that repeats the dek's unit.
    - No legend on a single-series chart.

    *(TS §6.3–6.4, KB)*
27. **Affordance and non-text contrast (i).**
    - The focus ring, input and select borders, segmented-control edges, the active tab underline and the forecast line reach 3:1 against their surface.
    - Nothing coloured or underlined is unclickable.
    - The rail's active item has no filled pill.
    - The sticky filter bar is opaque.
    - Each view has at most one filled primary button.

    *(IN critique-color and critique-affordance; TS §3.2, §13)*
28. **Filters and edge cases (i).**
    - After filtering, the inbox count in the rail, the tab counts and the series count update to match the view.
    - An emptied module keeps its title and frame, with one sentence across it.
    - A cold-start SKU, a single intermittent SKU and the longest family or region name render without clipping, overlap, or a lone dot in a full-size plot.
    - Red appears at most once per row.

    *(TS §11; IN handoff-spec)*

### 10.6 What does not apply

The four observability entries (grafana-dashboards, kibana-dashboards, AxiomHQ, firecrawl-dashboard-reporting) build dashboards inside monitoring platforms, or scrape other people's dashboards. Their queries, JSON schemas, provisioning, APIs, CLI scripts, alerting and live-refresh patterns have no place in a static React + ECharts app built from a monthly bundle. Only the composition rules in §10.4 carry over. From the rest of the list, these parts are out too:

- **K1 and K2:** the SQL, the Streamlit code, the SaaS KPI catalogues (MRR, churn, CAC) and the real-time operations layouts.
- **DD2:** the kit install, the gate scripts, the hand-drawn SVG chart inventory (we use ECharts) and the trading charts.
- **TasteSkill:** version 2.5's website pipeline (photographs, hero entrances, shader scenes, scroll moments), its style dealer and inspector scripts, and v1's dials and perpetual motion.
- **UI/UX Pro Max:** the mobile `app-interface.csv`, the per-framework files, the style catalogue, the palettes and the font pairings. The owner's colour override and the Editorial type system decide those.
- **Infrasity:** the other ~85 skills (personas, journey maps, card sorts, design-system governance) are process for multi-week product work, not for a hackathon dashboard with a fixed brief. Its `interface-design` duplicates C2.
