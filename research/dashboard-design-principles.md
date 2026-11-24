# Dashboard design principles: a playbook for the Celeris control tower

Compiled 2026-11-24 from web research (sources in §13, cited inline as `[KEY]`). This file pairs with the
adopted **Editorial Precision** spec (`research/scratch/design-editorial/spec.md`, cited as `Spec §x`). Where
the spec already sets a value, this file checks it against the literature. It does not override the spec. Where
the literature points somewhere the spec does not yet go, the gap is marked **Δ spec**.

**How to use it.** Each rule is a tickable line with a level, a concrete threshold and a way to check it from a
screenshot.

- **MUST**: failing it costs points with the jury (clarity, usability, effectiveness), or breaks a
  problem-statement requirement or WCAG 2.2 AA.
- **SHOULD**: the difference between "good" and "best in show".
- **NICE**: polish, done only after every MUST and SHOULD passes.

Sections run from most to least important. Within a section, rules are ranked.

**Screenshot protocol for reviewers.** Take these shots for each view (commands in the task brief):

1. 1440×900 light, the fold;
2. 1440×900 dark, the fold;
3. 1440×2800 light, the whole page;
4. 390×844 phone width;
5. the same page at 200 % browser zoom (keyboard check).

Then run three quick tests on the PNGs:

- **Squint / blur test.** Blur the shot. The first two things you see should be the headline and the hero
  figure.
- **Greyscale test.** Desaturate the shot. Forecast vs history, and every status, must still be readable.
- **Cover test.** Cover the legend. Every series must still be identifiable.

---

## 0. The twelve rules that matter most

If time runs out, check these first. Each one links to its full rule.

1. **Answer first.** Every view opens with a computed headline that contains a number, a direction and a
   comparison, followed by one hero figure (H1, K1). `[FEW-P] [DD] [PULSE]`
2. **One continuous timeline.** History and forecast meet on the same line. The forecast is marked
   three ways: hue, a window tint and a "last actual" rule with a label. It survives greyscale (F1, F2).
   (Problem statement §5.)
3. **Uncertainty is named in words.** "P10–P90, the range 8 in 10 outcomes should fall in", with the
   numbers written next to the band (F4). `[WIL] [BOE]`
4. **Chart titles state the conclusion**, from a deterministic template with a descriptive fallback.
   The subtitle carries units and scope (CH1). `[DW-T] [DD]`
5. **One accent, used only for meaning.** Everything else is neutral. Status colour always comes with an
   icon or a word (C1–C3). `[FEW-P] [CBN-C] [W-141]`
6. **Rules and whitespace, not boxes.** Spacing inside a group is smaller than spacing between groups.
   There are no shadows on page modules (S1, S2). `[NNG-GP] [FEW-P]`
7. **Direct labels and annotations instead of legends.** Two to five annotations per hero chart (CH4,
   CH5). `[NNG-CLT] [DW-T]`
8. **Numbers are typeset.** Tabular figures in columns, the same precision within a column, a true minus,
   compact units and no false precision (T3, T4). `[STR-T] [FEW-P] [MDN-FVN]`
9. **Contrast.** Text 4.5:1, large text 3:1, every chart mark needed to read the chart 3:1, the focus ring
   3:1 (A1–A3). `[W-143] [W-1411] [W-2413]`
10. **Filters are always visible and honest.** Active state, a count of series in view, one-click reset,
    and the state kept in the URL (I1–I3). `[NNG-TBL] [NNG-FLT]`
11. **No dead ends.** Empty, loading and error states explain what happened and offer the next step (M3,
    M4). `[NNG-ES] [NNG-SK]`
12. **Nothing stale.** No "provisional" banners or placeholder copy once the final forecast is in. Every
    number comes from the bundle (H8).

---

## 1. Information hierarchy and layout

A dashboard is "a visual display of the most important information needed to achieve one or more objectives,
consolidated and arranged on a single screen so the information can be monitored at a glance" `[FEW-P]`. It
supports a three-step process `[FEW-P]`:

1. see the big picture;
2. focus on what needs attention;
3. drill in to act.

That is Shneiderman's "overview first, zoom and filter, then details-on-demand" applied to monitoring
`[SHN]`.

- [ ] **H1 MUST: Answer-first stack on every view.** Each view runs headline → standfirst → hero
  evidence → supporting modules → detail. A reader who stops after the headline still leaves with the
  answer. *Check:* cover everything below the lede. Can you still say what the view concluded? `[FEW-P]
  [DD] [PULSE]`; Spec §2.1, §5.1.
- [ ] **H2 MUST: The most important thing sits in the prime spot.** Top-left to top-centre of the content
  area, above the fold at 1440×900. Logos and navigation are subdued and never take that spot `[FEW-P]`
  (pitfall 9). People scan in an F-pattern when nothing strong guides them, so front-load the first words
  of every heading `[NNG-F]`. *Check:* the 1440×900 shot shows the headline, the hero figure and the top of
  the hero chart.
- [ ] **H3 MUST: One job per view, one question per module.** Write down the question each module
  answers. Remove modules that answer none. Order modules from *what is happening* to *why* to *what to do*
  `[DD]`. *Check:* every module title reads as an answer to a question (see CH1).
- [ ] **H4 MUST: Visual weight follows importance.** "When everything is visually prominent, nothing stands
  out" `[FEW-P]` (pitfall 10). Exactly one element per view is set large: the hero. Supporting figures are
  smaller. Everything else is quiet. *Check:* the blur test shows two to three dark masses (headline, hero,
  hero chart), not a uniform grid.
- [ ] **H5 MUST: Things that are compared sit side by side, on the same scale.** Related items (a KPI and
  its trend; actual and its benchmark) are adjacent `[FEW-P]` (pitfalls 7 and 9). Small multiples share
  their y-scale (CH9). *Check:* no comparison requires scrolling or switching tabs.
- [ ] **H6 SHOULD: Two levels of disclosure at most.** The overview leads to the view, and the view leads
  to a drawer or popover. "Designs that go beyond 2 disclosure levels typically have low usability"
  `[NNG-PD]`. Label the control that discloses, so it sets expectations. *Check:* count the clicks from the
  overview to any number's lineage. No more than three, and no modal stacked on a modal.
- [ ] **H7 SHOULD: The fold carries the story, and the scroll carries the evidence.** Few's single-screen
  ideal `[FEW-P] [NNG-DASH]` is relaxed for analytical views, but the lede plus the hero chart must fit in
  900 px. Supporting modules can scroll. Never use fixed-height cards with inner scrollbars (Spec §3.6).
- [ ] **H8 MUST: Nothing stale, nothing hand-typed.** Every number on screen comes from the bundle.
  Provisional banners and "stand-in" footnotes are gone now that the final forecast is integrated.
  **Note:** the Editorial mock screenshots still show "Provisional forecast" and its footnote. Remove both
  in the build. *Check:* search the DOM text for "provisional" and "stand-in". There should be none, except
  where the Data download view describes inputs.
- [ ] **H9 SHOULD: Orientation for a cold visitor.** A judge arrives with no context. Show the time
  windows in the masthead or rail ("Actuals Jan 2019 – Oct 2026 · Forecast Nov 2026 – May 2028"), and
  group the views as *what happened / what will happen / act*. Datadog: "adding a clear description is a
  must for an effective dashboard" `[DD]`. Spec §4.4 covers this.
- [ ] **H10 NICE: Every module offers a path to detail.** One-click links from the overview to the view
  that explains it `[DD]`, for example a briefing sentence that links to a filter or view, as the current
  build does.

## 2. KPI and hero figure design

- [ ] **K1 MUST: Every figure answers "compared to what?".** A bare number "means little" `[FEW-P]`
  (pitfall 2). Each hero or supporting figure carries:
  - a comparison (last 19 months, the benchmark, the target);
  - a direction glyph and signed delta (▲ / ▼ and +3.2 % / −3.2 %);
  - the comparison window in plain words ("vs the last 19 months of demand") `[SAAS-KPI]`.

  *Check:* every figure has a second line of context.
- [ ] **K2 MUST: State the variance directly.** If the point is the gap, show the gap, as a percentage,
  against a zero reference. Don't make the reader subtract two numbers `[FEW-P]` (pitfall 4).
- [ ] **K3 MUST: Precision fits the decision.** Write $3.8M, not $3,848,305.93 `[FEW-P]` (pitfall 3). Use
  the compact rules in Spec §3.5:
  - full figures under 10K;
  - one decimal from 10K to 100K;
  - none from 100K;
  - two decimals for M and B in figures.

  Exact values go to tooltips, tables and CSV `[DW-T]`.
- [ ] **K4 MUST: "Up" is not automatically good.** The delta colour encodes good or bad for *this*
  metric, not its sign. Demand down is neutral, lost sales up is bad, error down is good. When in doubt,
  use a neutral ink delta with a glyph and no red or green `[SAAS-KPI]`.
- [ ] **K5 SHOULD: Show the range on the hero.** For a forecast hero, a range strip (P10–P90 band, P50
  tick, last-period marker) is a bullet-graph form. It beats a gauge every time `[NNG-DASH] [FEW-B]`.
  Bullet-graph rules `[FEW-B]`:
  - two to five qualitative ranges, ideally three;
  - single-hue intensities with darker = worse (three ranges at 40 %, 25 % and 10 % black);
  - the featured bar about 1/3 the container's thickness;
  - the scale starts at zero unless narrowing it is the point (then say so).

  Spec §5.2 already has a range strip.
- [ ] **K6 SHOULD: At most one hero and four to five supporting figures per view.** Six or more
  equal-weight KPI tiles is the classic "admin template" look. Prefer a figure strip of four with rules
  between (Spec §5.3).
- [ ] **K7 SHOULD: Figure typography.** Hero 48–56 px sans, weight 600, proportional figures (tabular
  makes "121" look loose). Units in a smaller, lighter weight next to the number ("2.61M units"). Never
  animate hero numbers on load (Spec §3.5, §3.6). Carbon's largest productive size is 54/64 `[CBN-T]`,
  which matches the spec's 54 px hero.
- [ ] **K8 NICE: A sparkline only when the path matters.** A sparkline adds the trend path a delta cannot
  show, but too many turn a summary into a micro-dashboard `[SAAS-KPI]`. Use at most one per figure, with
  no axes, ending in a dot at the current value.

## 3. Typography for data products

- [ ] **T1 MUST: A short, consistent type scale.** About 6–8 sizes with fixed roles. For reference,
  Carbon's productive set (14 px base for dense product UI) runs 12/16 label, 14/18 compact body, 14/20
  body, 20/28, 28/36, 32/40, 42/50, 54/64 `[CBN-T]`. Spec §3.5 (38 display, 54 hero, 29 figure, 17.5
  lede, 17 title, 14 body, 13 small, 12 caption, 11.5 axis, 10.5–11 eyebrow) is in that range. *Check:* no
  more than about eight distinct sizes on a page, and no one-off sizes.
- [ ] **T2 MUST: Chart text is at least 12 px and near-black or ink-3.** Datawrapper's readable default
  is sans, regular weight, sentence case, "a size above 12px", near-black `[DW-T]`. **Δ spec:** axis ticks
  at 11.5 px and eyebrows at 10.5 px sit at or below this floor. Raise axis ticks to 12 px. Keep eyebrows
  at 11 px or more, uppercase with +0.09em tracking, and only for labels that are never the sole carrier
  of information.
- [ ] **T3 MUST: Numbers are typeset.**
  - `font-variant-numeric: tabular-nums` (lining) in every table, axis, tooltip and numeric column
    `[MDN-FVN] [STR-T]`.
  - The same number of decimals within a column, and "as few significant figures as possible" `[STR-T]`.
  - A true minus sign (U+2212). Thin-spaced units.
  - Never ISO dates in reading text: "Oct 2026" in charts, "October 2026" in prose (Spec §3.5).
- [ ] **T4 MUST: Alignment.** Numbers are right-aligned. Text is left-aligned. Headers follow their
  column's alignment. Nothing is centred `[STR-T] [DW-T]`. Avoid centre or right alignment for any
  annotation longer than about 10 words `[DW-T]`.
- [ ] **T5 MUST: Readable measure.** Body and standfirst run 45–90 characters per line `[BUT]`. The spec
  caps the standfirst at 70ch and headlines at 24ch with `text-wrap: balance` (Spec §3.5). *Check:* no
  standfirst line runs past about 90 characters at 1440 px.
- [ ] **T6 SHOULD: Text hierarchy by contrast, size and weight, never by colour alone.** "The biggest and
  boldest text with the highest contrast against the background should be reserved for the most important
  information." Start everything small, thin and grey, then emphasise only what must not be missed `[DW-T]`.
  Use at most two annotation sizes, and bold inside them for emphasis `[DW-T]`.
- [ ] **T7 SHOULD: Sentence case everywhere.** Uppercase is only for short eyebrows. No title case. No
  rotated axis labels: rephrase, abbreviate, or switch to a horizontal bar chart `[DW-T]`.
- [ ] **T8 SHOULD: Distinct roles for type families, three at most.** A serif for the editorial voice
  (headline, standfirst, brief), a grotesk for evidence (labels, numbers, tables), a mono for identifiers
  (SKU codes, hashes). Spec §3.5 uses Source Serif 4, IBM Plex Sans and IBM Plex Mono, all self-hosted.
  Linear uses a display cut for headings and the text cut elsewhere, for the same reason `[LIN]`.
- [ ] **T9 NICE: Optical sizing and balanced wraps.** `font-variation-settings: "opsz"` matched to size
  on the serif, `text-wrap: balance` on headlines, `text-wrap: pretty` on the standfirst.

## 4. Spacing and grid

- [ ] **S1 MUST: Proximity carries the structure.** Spacing inside a group is smaller than spacing between
  groups. Content sits closer to its own heading than to the previous section. Proximity "can overpower
  competing visual cues such as similarity of color or shape" `[NNG-GP]`. *Check:* measure the gap from
  title to dek (about 4 px), dek to chart (about 12 px), and module to module (about 30 px). Each step
  should be clearly larger than the one before (Spec §3.6).
- [ ] **S2 MUST: Rules, not boxes.** Use a 1 px rule above each module. No border plus background plus
  shadow on page content (Spec §2.5, §3.6). Box-in-box nesting and equal shadowed white cards are the
  admin-template signature. Decoration of any kind is "pure decoration, visual content that the viewer must
  process to get to the data" `[FEW-P]` (pitfall 11). Raised surfaces are only for things that float:
  popovers, drawers, tooltips, menus.
- [ ] **S3 MUST: One spacing scale, used through tokens.** Carbon's scale is 2, 4, 8, 12, 16, 24, 32, 40,
  48, 64, 80, 96, 160. Carbon says deviations "should be avoided whenever possible" `[CBN-S]`. **Δ spec:**
  Spec §3.6 lists 14 steps, including 6, 10, 14 and 30. That is allowed, but in code review check that only
  tokens are used, never raw pixel values, and that 6, 10 and 14 appear only inside components.
- [ ] **S4 MUST: A 12-column grid with consistent edges.** Every module's left edge, chart plot area and
  table first column align to the grid. Datadog: timeseries at least 4 of 12 columns wide, so they don't
  look squashed `[DD]`. Spec §3.6: a 1128 px measure, 24 px gutters, 7/5 two-column splits, lede at 8/4.
  *Check:* lay a ruler on the full-page shot. The left edges should form one to three lines, not five.
- [ ] **S5 SHOULD: Content sets height.** No stretched charts filling leftover space. Few calls out graphs
  "simply stretched" to fill space as a sign of an unappealing dashboard `[FEW-P]` (pitfall 13). Chart
  aspect ratio follows the data: wide and short for long time series, at least 2.5:1 for 9.5 years of
  months.
- [ ] **S6 SHOULD: Breathing room scales with importance.** The lede gets the most space (about 48 px
  around it), modules about 30 px, rows 8–12 px. Uneven, accidental whitespace reads as unfinished.
  Deliberate whitespace reads as premium.
- [ ] **S7 NICE: Vertical rhythm.** Line-heights and gaps land on a 4 px baseline, so adjacent columns'
  text lines align when side by side.

## 5. Colour systems and contrast

### 5.1 Interface colour

- [ ] **C1 MUST: A neutral page with one accent.** "Keep colors subdued and neutral, except when you are
  using color to highlight something as especially important" `[FEW-P]` (pitfall 12). Linear reduced its
  themes to three inputs (base, accent, contrast) and limited the blue in its chrome to get "a more neutral
  and timeless appearance" `[LIN]`. Celeris rule: **ink is the past, cobalt is the future**. Cobalt is
  never decoration, a series colour or a category (Spec §3.1–3.3).
- [ ] **C2 MUST: The neutral ramp has fixed roles.** Separate tokens for page, raised surface, hover,
  border (two strengths), grid, and text at three levels. Vercel's Geist encodes the roles in the step
  numbers: 1–3 backgrounds, 4–6 borders, 7–8 high-contrast fills, 9–10 secondary and primary text
  `[GEIST]`. Gridlines are lighter than axis labels, and titles are darker still `[DW-SG]`. Tint the neutrals
  slightly toward the accent hue, so they don't read as cold or as a category `[DW-C] [DW-SG]`.
- [ ] **C3 MUST: Status colour is semantic, scarce, and never alone.**
  - Red, amber and green mean act, risk and ok. They are never used for series.
  - They always come with an icon, word or shape. Use of colour (WCAG 1.4.1) forbids colour as the only
    means `[W-141]`.
  - Colour-vision deficiency is common: Few cites 10 % of males and 1 % of females, and NN/g about 4.5 %
    of the general population `[FEW-P] [NNG-DASH]`.
  - Carbon's alert set: danger #da1e28, serious #ff832b, warning #f1c21b, success #198038 `[CBN-C]`.

  *Check:* in the greyscale shot, every status still reads, through its glyph or word.
- [ ] **C4 SHOULD: Build colours in a perceptual space and generate the contrast.** Stripe built its
  palette in CIELAB so that a level difference predicts contrast: five levels apart passes small text, four
  passes icons and large text `[STRIPE]`. Linear moved theme generation from HSL to LCH `[LIN]`. Celeris'
  ramps are OKLCH with monotone lightness (Spec §3.4).

### 5.2 Data colour

- [ ] **C5 MUST: Categorical colour comes last.** First try emphasis: one entity in ink or accent, the rest
  in grey. Use grey "for context data, minor annotations, and unselected items" `[DW-C]`. If several colours
  are needed:
  - 7 at most (Datawrapper: "If you need more than seven colors in a chart, consider using another chart
    type or to group categories together" `[DW-C]`; Atlassian advises 5–6 `[ATL-DV]`);
  - otherwise fold the rest into "Other" or use small multiples.
- [ ] **C6 MUST: Colour follows the entity, everywhere.** The same family keeps the same colour in every
  chart and under every filter. "Consider using the same color for the same variables" `[DW-C]`. Use a fixed
  order, as the FT and Carbon do: "applied in sequence strictly", with the order chosen to maximise contrast
  between neighbours `[CBN-C] [DW-SG]`. *Check:* filter to two families. Their colours do not change.
- [ ] **C7 MUST: No meaningless colour.** Never colour bars by category when the axis already labels them.
  "Time is wasted as our brains … search for the nonexistent meaning" `[FEW-P]`. Bars in a ranked list are
  one colour, with the highlighted item in ink or accent.
- [ ] **C8 MUST: Sequential ramps are a single hue and monotone in lightness.**
  - Light = low on a light background, and reversed in dark mode: "the lightest color denotes the largest
    values" in dark themes `[CBN-C]`.
  - Never use a rainbow. Never use a gradient in place of a sequential palette `[CBN-C] [DW-C]`.
  - Make it readable in black and white `[DW-C]`.
- [ ] **C9 MUST: Diverging ramps are reserved for deviation from a meaningful midpoint** (bias, change
  against last year, correlation).
  - Two clearly different hues, with a light grey middle, not white `[DW-C]`.
  - The legend names the poles in words ("over-forecast", "under-forecast").
  - Celeris: rust ↔ steel, with steel deliberately not cobalt, so a bias map is never read as forecast
    volume (Spec §3.4).
- [ ] **C10 MUST: Validate for colour-vision deficiency, in both modes.** Simulate deuteranopia, protanopia
  and tritanopia, and check adjacent pairs (Spec §3.3 reports a Machado CVD ΔE of at least 12 on adjacent
  slots). Datawrapper: vary lightness, not just hue, so palettes survive CVD `[DW-C]`.
- [ ] **C11 SHOULD: Big areas toned down, thin marks saturated.** The FT uses one colour for columns and a
  more saturated one for lines. Small points and lines need high contrast. Large areas can be toned down
  `[DW-SG] [DW-C]`. For example: forecast bars of non-leaders in `--accent-tint`, the forecast line in full
  `--accent`.
- [ ] **C12 SHOULD: Dark mode is re-derived, not inverted.** Datawrapper's dark mode changes the colour of
  every element so contrast holds: "colors that are very dark on the white background will be very bright
  on the black background" `[DW-DM]`. GitLab requires data colours at 3:1 or more against *both* surfaces
  `[GITLAB]`. *Check:* the dark shot has no muddy low-contrast series and no pure-white glare blocks.
  Sequential ramps flip direction.

### 5.3 Contrast thresholds (WCAG 2.2 AA)

- [ ] **A1 MUST: Text 4.5:1. Large text 3:1.** Large means at least 24 px regular, or at least 18.5 px
  bold `[W-143]`. Placeholder, muted and caption text are included. Only disabled controls and logos are
  exempt.
- [ ] **A2 MUST: Chart marks needed for understanding, at 3:1 against adjacent colours.** For example
  "each line in a graph". Lines need 3:1 against the background, not against each other. 2.999:1 fails
  `[W-1411]`. Exceptions:
  - when text labels or values on the chart, or a table that follows it, give the same information;
  - essential gradients such as heat maps.

  The P10–P90 band fill can be below 3:1 *because* the P10 and P90 values are printed next to it and sit
  in the tooltip and table. Keep it that way. For interactive charts, "the unfocused default version must
  already have sufficiently contrasting colors" `[W-1411]`.
- [ ] **A3 MUST: A visible focus ring on every interactive element.** WCAG 2.4.7 (AA) requires a visible
  focus indicator, and 2.4.11 (AA) requires that it not be hidden behind sticky bars. The AAA target
  (2.4.13) is a good bar to aim for: an indicator area at least the size of a 2 px perimeter, and at least
  3:1 between the focused and unfocused states `[W-2413]`. Spec §3.6 uses a 2 px accent outline with a
  2 px offset.
- [ ] **A4 MUST: Pointer targets at least 24×24 CSS px**, or spaced so that a 24 px circle centred on
  each does not touch another target (WCAG 2.5.8 AA) `[W-258]`. *Check:* the "i" info buttons, chip close
  buttons, table sort arrows and legend toggles. These are the usual offenders.
- [ ] **A5 SHOULD: Charts carry a text alternative.** ECharts `aria.enabled` builds a description from the
  title and data. `aria.decal.show` adds patterns so series stay distinct without colour `[ECH]`. At a
  minimum, each chart has an `aria-label` equal to its conclusion title, and a data table one click away.

## 6. Chart craft

- [ ] **CH1 MUST: The title states the conclusion. The subtitle carries the what and the units.**
  - "Give the main statement first and the precise data explanation later" `[DW-T]`. Datadog: put the
    question a chart answers in its title `[DD]`.
  - Titles are generated from deterministic templates, with a descriptive fallback when the template's
    condition fails. They are never hand-typed numbers (Spec §2.3, §7).
  - The subtitle names the measure, the unit and the scope ("Units per month. History shows unconstrained
    demand…").

  *Check:* every chart title contains a verb and, where true, a number. The fallback titles are
  descriptive, not empty.
- [ ] **CH2 MUST: Choose the chart form by the comparison** `[FEW-P] [NNG-DASH] [FT-VV]`:
  - time → line;
  - ranking → sorted horizontal bar;
  - part-to-whole over time → stacked bar or small multiples;
  - deviation → diverging bar against zero;
  - distribution → dot or strip;
  - two dimensions of magnitude → heatmap;
  - build-up of a total → waterfall;
  - value against target or range → bullet.

  Never use 3-D, gauges or radial charts. Use pies or donuts only for overwhelming disparities. Avoid
  treemaps on actionable dashboards `[NNG-DASH] [NNG-CLT]`. Don't add variety for its own sake: "consistency
  in the means of display … allows viewers to use the same perceptual strategy" `[FEW-P]` (pitfall 6).
- [ ] **CH3 MUST: Bars start at zero. Line axes may not, if labelled.** A bar's length is its value, so a
  truncated bar axis lies `[FEW-P]` (pitfall 8). Line charts may zoom to the data range, with the axis
  labelled. Sort bars by value unless the order is intrinsic, such as time `[NNG-DASH]`.
- [ ] **CH4 MUST: Label directly, and the legend is a fallback.** Legends "require people to quickly look
  back and forth" `[NNG-CLT]`. Put labels at line ends and on bars. If a key is needed, it sits inline
  *above* the plot, in reading order, never at the bottom (Spec §2.4). "Every visual mark that represents a
  value or variable should be explained" `[DW-C]`. *Check:* cover the legend. Can you still identify every
  series?
- [ ] **CH5 MUST: Annotate the story.** Two to five annotations on a hero chart, each a short bold label,
  a grey one-line explanation, and a 1 px leader line to the exact data point (Spec §6.4). Use annotations
  to explain outliers and "why data looks the way it does" `[DW-T]`. On phones, number them and move the
  text below the chart `[DW-ANN]`.
- [ ] **CH6 MUST: Restrain axes and gridlines.**
  - Horizontal gridlines only for time series. Solid 1 px, lighter than the axis labels `[DW-SG]`.
  - No more than about five gridlines: pick units that reduce their number `[NNG-CLT]`.
  - No vertical gridlines. No chart border, background fill, drop shadow or gradient `[NNG-CLT] [FEW-P]`.
  - Drop the y-axis and gridlines entirely when every value is labelled `[NNG-CLT]`.
  - Omit axis titles when the title or subtitle already states the unit `[NNG-CLT]`.
  - Dashes are reserved for "another forecast" (benchmarks), never for gridlines (Spec §3.2).

  Tufte's test is how much ink "can be erased without loss of data-information" `[TUF]`. Don't follow
  it to absurdity: keep the ink that helps people read values `[TUF]`.
- [ ] **CH7 MUST: Tooltips name things and carry units.** "3.4 % unemployed", not "3.4 %" `[DW-T]`. Show
  the series name, the month as "Oct 2026", the value with its unit, and, for forecast months, P10 / P50 /
  P90 in a tabular column. Tooltips never hold information vital to the task, open on keyboard focus as
  well as hover, and never cover the point being read `[NNG-TT]`.
- [ ] **CH8 SHOULD: Emphasis, not colour soup.** One series in ink or accent. Context series in
  `--ink-4` grey. In a "selected family" view, draw all families in grey behind the selected one `[DW-SM]
  [DW-C]`.
- [ ] **CH9 SHOULD: Small multiples share the scale.**
  - The same y-scale by default. Readers who skip the axis labels "will quickly draw false conclusions"
    otherwise `[EU-SM] [ONS-SM]`. If the scales must differ, say so in the subtitle `[DW-SM]`.
  - Sort panels by what the reader should see first (change, size), never randomly.
  - Use fewer panels than you planned. "Do not be afraid to shrink your charts" `[DW-SM]`.
  - Put the y-axis only on the left column and the x-axis only on the bottom row.
- [ ] **CH10 SHOULD: Heatmap craft.**
  - A single-hue sequential ramp for magnitude, diverging only around a real midpoint `[ATL-HM] [DW-C]`.
  - A legend with labelled stops and a unit. A heat colour alone carries no numeric meaning `[ATL-HM]`.
  - A 1–2 px surface-coloured gap between cells.
  - Row and column labels outside the grid, horizontal.
  - An exact value on hover or in a linked table.
  - A star or ring for model-selected cells (as in the macro matrix), never a second colour scale.
- [ ] **CH11 SHOULD: Waterfall craft.**
  - Three colours only: increase, decrease, total `[MS]`. In Celeris, totals in ink, steps in slate, never
    red and green unless the step's meaning is good or bad.
  - Subtle connector lines from the end of each bar to the start of the next `[DOMO]`.
  - Totals are full bars from zero. Each step is labelled with a signed value.
  - Vertical for a cumulative sequence, horizontal when labels are long `[SAP-WF]`.
- [ ] **CH12 SHOULD: Bullet graphs instead of gauges and progress donuts** (K5) `[FEW-B] [NNG-DASH]`.
- [ ] **CH13 NICE: A consistent chart frame.** Every chart has the same anatomy, in this order: rule,
  title, dek, key, plot, source or "i" line. The same left inset. The same y-axis label width across
  vertically stacked charts, so plot areas align.

## 7. Forecast, uncertainty and the history-to-forecast seam

This section carries the problem statement's hardest visual requirement: "show history and forecast on one
continuous timeline, with the forecast clearly marked … with P10/P50/P90 ranges".

- [ ] **F1 MUST: One continuous line.** The forecast series starts *at the last actual point*, so there is
  no gap at the seam. Storytelling with Data: overlap the transition so both series have a value there "to
  avoid a gap in the line" `[SWD]`. *Check:* zoom on the seam in the shot. There is no break, jump or
  double point.
- [ ] **F2 MUST: The forecast is marked at least three ways, and survives greyscale.** In Celeris:
  1. cobalt hue on the line;
  2. a pale forecast-window wash;
  3. a solid vertical "Oct 2026 · last actual" rule with a FORECAST zone label (Spec §3.2, §6.2).

  Make the distinction explicit: "Don't make your audience question, make assumptions, or hunt for detail"
  `[SWD]`. Use of colour (WCAG 1.4.1) means hue alone is not enough `[W-141]`. Storytelling with Data recommends
  "thick, bold, solid lines … for actual data and thin, dotted lines" for forecasts `[SWD]`. IBCS marks a forecast as
  hatched (bars) or dashed (lines) and actuals as solid dark `[IBCS]`. Celeris uses solid cobalt plus the
  wash, and keeps dashes for benchmarks. That is consistent *as long as* the wash and rule are always
  present.
- [ ] **F3 MUST: Forecast bars are visually distinct from actual bars** wherever monthly or annual bars
  mix history and forecast (mix shift, family bars, procurement). Use the accent tint or a hatch for
  forecast and ink or slate for actual, after IBCS: actual solid dark, plan outlined, forecast hatched
  `[IBCS]`. Label each group "actual" and "forecast" on the axis or key.
- [ ] **F4 MUST: Say what the band means, in words and numbers.**
  - Always state what an interval represents `[WIL]`.
  - Label it "P10–P90 (80 % range)" in the key. Print the end-of-window values beside the band
    ("156.9K · P10–P90 154.9K–158.9K").
  - In prose: "8 in 10 months should land inside the band".
  - Readers otherwise treat bands as hard limits ("deterministic construal errors") `[WIL]`.
  - The public underestimates uncertainty, and fan charts are the best format found so far for showing
    expectation and uncertainty together `[BOE]`.
  - Institutions disagree on the coverage (Bank of England 90 %, OBR 80 %) `[BOE-BU] [OBR]`, so the
    coverage must be stated.
- [ ] **F5 MUST: P50 is reachable even when it is not drawn.** The problem statement asks for
  P10/P50/P90. If the P50 line is hidden because it overlaps the submitted forecast (Spec §6.3), P50 must
  still appear in the tooltip, the forecast table and the CSV, and a note must say why it isn't drawn.
- [ ] **F6 SHOULD: Show that the band can be trusted.** On Forecast & accuracy, show interval calibration
  from the backtest: "actuals fell inside P10–P90 in X % of backtest months; the target is 80 %". Pair it
  with WAPE and bias by family, region and horizon (problem statement §5). A planner trusts a band whose
  calibration is shown. This is the Quality of Insights lever.
- [ ] **F7 SHOULD: Thin bands need help.** At the aggregate level, Celeris' P10–P90 is narrow (the mock
  shows 2.59M–2.64M), so the band is almost invisible at chart scale. Keep the numeric range on the hero
  strip and at the line end, and let the band widen visibly when the reader filters to a single SKU.
  Don't inflate it, and don't hide it.
- [ ] **F8 SHOULD: Graded bands are optional.** Graded intervals convey "a range of different
  possibilities" `[WIL]`, and fan charts shade from dark (likely) to light (less likely) `[SCIAM]`. Add
  P25–P75 only if the bundle has it. Never invent quantiles.
- [ ] **F9 SHOULD: Benchmarks and scenarios look different from the forecast.** Benchmarks (seasonal
  naive) are 1.5 px dashed grey. The what-if scenario is a second, warm hue, solid, with the gap labelled
  at the end ("−4.1 %"). The base forecast stays cobalt (Spec §3.2).
- [ ] **F10 NICE: Uncertainty for decisions.** For a P90 procurement choice, a quantile dot plot or CDF
  helps people decide. Quantile dot plots with 50 outcomes gave expected payoffs about 97 % of optimal in a
  transit study `[KAY]`. The procurement view's service-level control (P80, P90, P95, P97.5) is the
  dashboard version of this. Label the trade-off in units and USD.

## 8. Tables

- [ ] **TB1 MUST: Typeset like a financial table.**
  - Numbers right-aligned, in tabular lining figures. Text left-aligned. Headers aligned with their data.
  - The same precision within a column. The unit with the first value or in the header, not repeated
    `[STR-T]`.
  - Identifiers (SKU, Record_ID) in mono.
- [ ] **TB2 MUST: Light horizontal rules, no zebra, no vertical grid.** "If you've properly aligned the
  data points in your table, rules become redundant", so keep rules "extremely light" `[STR-T]`. NN/g
  allows zebra or hover highlight to keep row context in wide tables `[NNG-TBL]`, so use a hover wash,
  not stripes.
- [ ] **TB3 MUST: Navigation affordances.**
  - Sticky header row (and first column if wide) when the table is longer or wider than the screen.
  - The first column is a human-readable identifier.
  - The sortable column shows its sort direction.
  - A "clear visual indication that filters are active" `[NNG-TBL]`.
- [ ] **TB4 MUST: Row detail in a non-modal side panel.** The exception inbox, anomaly register and
  lineage open in a drawer that keeps the table visible. NN/g prefers a non-modal side panel to a modal
  that hides neighbouring records `[NNG-TBL]`. Rows are focusable, Enter opens the drawer, and Esc closes
  it.
- [ ] **TB5 SHOULD: Inline bars and sparklines for magnitude.** A thin bar in the value cell (one hue,
  scaled to the column maximum, starting at zero) makes revenue at risk or lost USD scannable without a
  separate chart. Use backgrounds only for sums and averages, and annotations by symbol (✻ †) rather than
  colour `[STR-T]`.
- [ ] **TB6 SHOULD: Density.** Body text 13 px, row height about 36–40 px for comfortable scanning (a
  practitioner convention, not a standard), horizontal cell padding of 12 px or more, and the numeric
  columns grouped together. Offer no density toggle unless it is needed.
- [ ] **TB7 NICE: Column control without drag-and-drop.** Reordering by dragging headers has "relatively
  low discoverability and poor accessibility" `[NNG-TBL]`. Use a menu if column choice is ever needed.

## 9. Interaction, states, motion, responsiveness

### 9.1 Filters and navigation

- [ ] **I1 MUST: The five shared filters are always visible** (family, SKU, region, channel, customer;
  problem statement §5).
  - Each shows its current value ("Family · All").
  - Active filters look different (filled or ink border).
  - A "Reset" appears whenever any filter is set.
  - A live count ("3,093 series in view").

  NN/g: a "clear visual indication that filters are active" `[NNG-TBL]`.
- [ ] **I2 MUST: Filters respond within 1 s, with feedback within 0.1 s.** The 0.1 s limit feels
  instantaneous (highlight the chip). The 1 s limit keeps the flow of thought. Past 10 s, show percent-done
  and a way to cancel `[NNG-RT]`. Use interactive filters that apply immediately for exploratory users
  when results come back within about 1 s `[NNG-FLT]`. While updating, dim the previous render. Don't
  flicker or show a skeleton `[NNG-FLT]` (Spec §3.6: hold the previous render at 60 % opacity, then
  cross-fade).
- [ ] **I3 MUST: State lives in the URL.** Every view, filter, toggle and selected row is in the hash, so
  a judge's link reproduces the exact screen. Back and forward work.
- [ ] **I4 MUST: Click-to-filter is discoverable and reversible.** Clicking a bar or heatmap cell sets the
  filter, the filter bar shows it, and one click removes it. Show a pointer cursor and a hover wash on
  clickable marks. The tooltip says "Click to filter".
- [ ] **I5 SHOULD: Drill-down keeps context.** Family → SKU → region → customer with a breadcrumb. Each
  level keeps the same chart, so the reader's frame doesn't move (Shneiderman's zoom and filter `[SHN]`).
- [ ] **I6 SHOULD: Full keyboard path.**
  - Tab order follows reading order.
  - Arrow keys inside segmented controls and tabs.
  - Enter and Space activate. Esc closes popovers and drawers and returns focus to the trigger.
  - Tooltips also open on focus `[NNG-TT]`.
  - Every action reachable by pointer is reachable by keyboard.
- [ ] **I7 NICE: Copy link, download CSV of the current selection, and an "i" popover on every chart**
  naming the bundle file it reads (already in the build). This is a trust and presentation lever.

### 9.2 Loading, empty and error states

- [ ] **M1 MUST: No loading indicator under 1 s.** A skeleton only for a first full-page load under 10 s.
  A spinner for a single module from 2–10 s. A progress bar past 10 s. No frame-only skeletons. Shimmer
  "can potentially be distracting" `[NNG-SK]`. A static app on a local bundle should rarely need any of
  these.
- [ ] **M2 MUST: No layout shift.** Reserve chart heights so nothing jumps when data arrives. Fonts are
  self-hosted with metric-matched fallbacks.
- [ ] **M3 MUST: Empty states explain and offer a way out.** For example: "No exceptions match Family =
  HYD and Channel = Online. [Clear channel]". Never leave a blank panel. Don't announce "no data" while
  still loading. Give a direct pathway to the fix `[NNG-ES]`.
- [ ] **M4 MUST: Error states are specific.** For example: "Could not load forecast.json (bundle v1).
  Showing history only. [Retry]". Keep the rest of the app usable. Never show a raw stack trace or a
  blank chart with axes.

### 9.3 Motion

- [ ] **M5 MUST: Quiet, functional motion that respects `prefers-reduced-motion`.** Carbon durations
  `[CBN-M]`:
  - 70–110 ms for micro-interactions;
  - 150–240 ms for small expansions, popovers and toasts;
  - 400 ms for large expansions;
  - about 300 ms for chart cross-fades.

  Carbon's productive easing is cubic-bezier(0.2, 0, 0.38, 0.9), entrance (0, 0, 0.38, 0.9), exit
  (0.2, 0, 1, 0.9). It recommends productive motion for "rendering data tables and visualizations"
  `[CBN-M]`. Spec §3.6 (150–200 ms, cubic-bezier(.2,.7,.2,1)) fits. Use no load animations on numbers and
  no bouncing.
- [ ] **M6 SHOULD: Motion explains change.** Animate only to show continuity: a filter cross-fade, a
  drawer sliding 6 px from its edge, the time-machine origin moving. Never as decoration.

### 9.4 Responsiveness

- [ ] **R1 MUST: No horizontal page scroll at 390 px.** Phone gutters of 16 px or more. The rail
  collapses to a menu. The filter bar wraps or becomes a "Filters (2)" button that opens a sheet. Charts
  resize with their container. Tables scroll horizontally *inside* their own frame, with the first column
  sticky.
- [ ] **R2 SHOULD: Charts simplify, not just shrink, on small screens.** Fewer ticks. Annotations
  numbered and moved below `[DW-ANN]`. Small multiples wrap 7 → 4 → 2 columns (Spec §3.6). The
  hero figure stays first.
- [ ] **R3 SHOULD: Check at 1280 and 1024 px too.** Jury laptops are often 1280–1366 px wide. The lede's
  8/4 split must not crush the hero figure.

## 10. What the best products look like (2025–2026), and what to borrow

| Product | What they do | Borrow for Celeris |
|---|---|---|
| **Linear** | Rebuilt theming in LCH from 98 variables to 3 (base, accent, contrast). Less blue in the chrome. Inter Display for headings. Aligned labels, icons and buttons to "reduce visual noise … and increase the hierarchy and density" `[LIN]`. Critics warn that the copied "Linear look" (dark, glow, gradients) has become monotonous `[LR]`. | Neutral chrome with one accent, strict alignment, and a separate display face for headlines. **Don't** copy dark-glow-gradient. Editorial on paper is the differentiator. |
| **Stripe** | Colour built in a perceptual space, where the level difference guarantees contrast `[STRIPE]`. Unified the information architecture and made tables, filters and dialogs responsive. Contrast-generated tokens and a dark mode `[STR-S]`. | Token-generated contrast, and tables and filters that work at phone width. Precise numerals. |
| **Vercel (Geist)** | 10-step scales where each step has a role (backgrounds, borders, high-contrast fills, text) `[GEIST]`. | Name tokens by role, never by hue. |
| **Datadog** | Question-driven widgets, overview → why → act, one-click drill links, standard units, timeseries at least 4 of 12 columns, a description is a must `[DD]`. | The question becomes the title. Link every overview module to its view. |
| **Tableau Pulse** | Leads each metric with an AI-written natural-language summary above the value and trend, delivered as digests `[PULSE]`. | Celeris' deterministic headline and briefing do the same *without* a language model: traceable, reproducible, every sentence linked. Say so in the presentation. |
| **Hex** | Notebook logic beside a published app view, so the analysis behind the app stays one click away `[HEX]`. | The "i" popover with the bundle file and the Data download view's lineage play the same "show your work" role. |
| **RELEX** | "Alert-based UI" and an exception dashboard so planners can prioritise. Most planner actions are exception-driven `[RELEX]`. | The exception inbox ranked by revenue at risk, with cause → action. |
| **o9** | "Focus on what has changed, what is out of tolerance". Exceptions for big over- or under-forecasts, bias trends and forecast value-added. Prioritise by volume, value and margin `[O9]`. | Bias heatmap, FVA stairstep, ±25 % vs last year and ±10 % bias exception rules, ranked by value. |
| **Kinaxis Maestro** | Scenario modelling, exception handling with AI, prescriptive recommendations `[KX]`. | What-if with base vs scenario on one timeline, plus a recommended action per exception. |
| **Anaplan** | Practitioner guidance: boards for KPIs and variance, worksheets for big grids. KPI cards with a sparkline. Flag variances beyond a threshold (for example 10 %) with the same colour logic on every page `[ANA]`. | One colour logic across all 12 views. Thresholds stated in the UI. |

**The 2025–26 consensus, in one paragraph.** The best products look calm:

- neutral surfaces, with a single accent that means something;
- perceptual, generated colour tokens;
- tight alignment and few type sizes, with excellent numerals;
- dense interaction (keyboard, URL state, drawers) and sparse decoration;
- a sentence before the chart: a summary or headline;
- exception-first workflows in planning tools.

Editorial Precision adds one thing none of them has: newspaper-grade *argument*. That is computed
headlines, conclusion titles and on-chart annotation. It is the originality lever.

## 11. Why dashboards "look bad", and the fix for each

| # | Symptom you can see in a screenshot | Why it reads as amateur | Fix (rule) |
|---|---|---|---|
| 1 | A grid of equal white cards with shadows and borders | No hierarchy. Box-in-box noise. The "admin template" signature | Rules and whitespace, and one hero (S2, H4, K6) |
| 2 | Six or more KPI tiles of identical weight | Nothing stands out `[FEW-P]` | One hero and a strip of four or fewer, each with a comparison (K1, K6) |
| 3 | Noun titles ("Sales by region") | The reader has to find the point | Computed conclusion titles plus a dek with units (CH1) |
| 4 | The library's default palette, a rainbow of categories | Colours mean nothing, and the brain hunts for meaning `[FEW-P]` | Emphasis first, a fixed entity palette of 7 or fewer, cobalt only for forecast (C5–C7) |
| 5 | Legend at the bottom, many series | Eye ping-pong `[NNG-CLT]` | Direct labels and an inline key above the plot (CH4) |
| 6 | Dark or dashed gridlines, chart borders, axis titles that repeat the subtitle | Non-data ink competes with data `[TUF] [NNG-CLT]` | Five or fewer light solid gridlines, no frame, no redundant axis titles (CH6) |
| 7 | Numbers centre-aligned, with mixed decimals and proportional digits | Columns don't scan | Right-aligned tabular figures, fixed precision (T3, T4, TB1) |
| 8 | $3,848,305.93 or 0.2734 % | False precision slows reading `[FEW-P]` | Compact formats, with exact values in tooltip and CSV (K3) |
| 9 | Rotated or overlapping axis labels | Hard to read, and looks broken | Fewer ticks, short month format, horizontal bars (T7) |
| 10 | Grey-on-grey small text | Fails 4.5:1, looks washed out | Ink ramp with checked contrast. Text 12 px or more (A1, T2) |
| 11 | Stretched charts with empty bands, or fixed-height cards with inner scrollbars | Space-filling, not data-shaped `[FEW-P]` | Content sets height. Aspect ratio from the data (S5) |
| 12 | Misaligned left edges, random gaps | Feels unfinished | A 12-column grid, tokens only, a ruler check (S3, S4) |
| 13 | Gauges, donuts, 3-D, gradients, glow, emoji icons | Decoration that distorts `[NNG-DASH] [NNG-CLT]` | Bullets, bars, lines. No effects (CH2, CH12) |
| 14 | Forecast drawn like history, or with a gap at the seam | Fails the core requirement | Continuous line, triple-marked forecast (F1, F2) |
| 15 | A band with no explanation | Read as hard limits `[WIL]` | "P10–P90 (80 % range)" and printed values (F4) |
| 16 | Red and green as the only status cue | Excludes CVD readers, fails WCAG 1.4.1 | Glyph or word plus colour (C3) |
| 17 | Dark mode by inversion: neon series, grey mud | Contrast lost, ramps reversed wrongly | Re-derived dark tokens, ramps flipped, 3:1 on both surfaces (C12) |
| 18 | Blank panels, "No data", spinners flashing on filter | Looks broken, erodes trust `[NNG-ES]` | Explained empty states. Dim-and-hold on update (M1, M3, I2) |
| 19 | Filters hidden in a drawer, active filters invisible | The reader cannot trust what they are seeing | A visible filter bar with active state, count and reset (I1) |
| 20 | Meaningless variety: every module a different chart type | Re-learning cost `[FEW-P]` | Same form for the same comparison (CH2) |
| 21 | Logo and navigation in the prime top-left spot | Wastes the most-read area `[FEW-P]` | A quiet rail. The content's headline takes top-left of the content area (H2) |
| 22 | Stale "provisional" banners, placeholder text, ISO dates in prose | Signals an unfinished product | Remove them, and use "Oct 2026" formats (H8, T3) |

## 12. 40-item QA checklist (tick against the screenshots)

Run it on every view in light and dark at 1440×900, plus a full-page shot, plus 390 px. "All views" means all
12.

**Story and hierarchy**

1. [ ] Every view opens with a computed serif headline containing a number, a direction and a comparison,
   with a standfirst below it (H1).
2. [ ] Exactly one hero figure per view, set larger than everything else, with a comparison line under it
   (H4, K1).
3. [ ] At 1440×900 the fold shows the headline, the hero and the top of the hero chart (H2, H7).
4. [ ] The blur test shows the headline and hero first, not the rail, logo or filter bar (H4).
5. [ ] Every module title states a conclusion (a verb, plus a number where true). Fallbacks are
   descriptive, not blank (CH1).
6. [ ] No "provisional", "stand-in", lorem or TODO text anywhere. No hand-typed numbers (H8).

**Requirements (problem statement §5)**

7. [ ] The five filters (family, SKU, region, channel, customer) are visible on every view. Active ones
   look different. A reset and a series count are present (I1).
8. [ ] History and forecast form one unbroken line, with no gap at Oct → Nov 2026 (F1).
9. [ ] The forecast is marked by hue, window wash and a "last actual" rule with a label, and is still
   identifiable in greyscale (F2).
10. [ ] P10–P90 is drawn and labelled as an 80 % range with printed values. P50 is in the tooltip and
    table (F4, F5).
11. [ ] Executive overview: units **and** revenue on one timeline, mix by family, region and channel, and
    the headline 19-month forecast.
12. [ ] Forecast & accuracy: backtest WAPE **and** bias by family, region **and** horizon. Interval
    calibration shown (F6).
13. [ ] Demand explorer drills family → SKU → region → customer with a breadcrumb. Anomaly monitor shows
    type, reason and action on the timeline. Data health shows issues by type and file, and before vs
    after.

**Colour and contrast**

14. [ ] Cobalt appears only for forecast, links, focus and selection. Never as a category or decoration
    (C1).
15. [ ] No chart uses more than 7 categorical colours. The same family has the same colour in every view
    and filter state (C5, C6).
16. [ ] Bars in a ranked list are one colour. Highlights come from emphasis, not rainbow (C7).
17. [ ] Every status colour comes with a glyph or word (C3).
18. [ ] Sequential ramps are single-hue and light-to-dark (flipped in dark mode). Diverging ramps have a
    grey midpoint and named poles (C8, C9).
19. [ ] Text contrast is at least 4.5:1 (spot-check captions, axis ticks and placeholders in both modes)
    (A1).
20. [ ] Lines, bars and markers needed to read a chart reach 3:1 against the surface in both modes (A2,
    C12).

**Typography and numbers**

21. [ ] Six to eight type sizes at most per page. Three families: serif voice, sans evidence, mono IDs (T1,
    T8).
22. [ ] Axis ticks and chart labels are 12 px or more. No rotated labels (T2, T7).
23. [ ] Numeric columns, axes and tooltips use tabular figures, right-aligned, with the same decimals per
    column (T3, T4, TB1).
24. [ ] Compact formats (2.61M, 51.4K, 6,961). A true minus sign. No ISO dates in reading text (K3, T3).
25. [ ] Standfirst lines are 90 characters or fewer. Headlines are balanced, 2 lines at most (T5).

**Layout and spacing**

26. [ ] No shadows, cards or boxes on page modules. A 1 px rule above each module (S2).
27. [ ] Spacing inside a group is visibly smaller than spacing between groups (S1).
28. [ ] Left edges of modules, plots and tables align to the grid (S4).
29. [ ] No stretched charts, no fixed-height cards with inner scrollbars, no layout shift on load (S5, M2).

**Charts**

30. [ ] Series are directly labelled. Any key sits inline above the plot. Cover the legend and every series
    is still identifiable (CH4).
31. [ ] Hero charts carry 2–5 annotations with leader lines. None collide (CH5).
32. [ ] Gridlines are light, solid and 5 or fewer. No chart borders, gradients or 3-D. Bar axes start at
    zero (CH3, CH6).
33. [ ] Small multiples share a y-scale (or the dek says otherwise) and are sorted meaningfully (CH9).
34. [ ] Heatmaps have a labelled legend with units. Waterfalls use three colours with totals from zero
    (CH10, CH11).
35. [ ] Tooltips show the name, "Oct 2026", the value with its unit, and P10/P50/P90 on forecast months,
    without covering the point (CH7).

**Interaction and states**

36. [ ] Changing a filter gives feedback at once and redraws within about 1 s, holding the old render
    dimmed. No blank flash (I2, M1).
37. [ ] The URL hash reproduces the exact view, filters and toggles. Back and forward work (I3).
38. [ ] Tab reaches every control in reading order with a visible 2 px focus ring. Esc closes drawers and
    popovers. Targets are 24×24 px or more (A3, A4, I6).
39. [ ] Empty filter combinations show an explanation and a one-click way out. A missing bundle file shows
    a specific error, not a blank chart (M3, M4).
40. [ ] At 390 px: no horizontal page scroll, the filters collapse to a button, charts simplify, and tables
    scroll inside their frame (R1, R2).

## 13. Sources

All fetched or searched on 2026-11-24. Keys are used inline above.

**Foundations, hierarchy, dashboards**

- `[FEW-P]` Stephen Few, *Common Pitfalls in Dashboard Design*, Perceptual Edge. https://www.perceptualedge.com/articles/Whitepapers/Common_Pitfalls.pdf
- `[FEW-B]` Stephen Few, *Bullet Graph Design Specification*. https://www.perceptualedge.com/articles/misc/Bullet_Graph_Design_Spec.pdf
- `[SHN]` Ben Shneiderman, *The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations*, IEEE VL 1996. https://drum.lib.umd.edu/items/155a868e-fb83-4115-9899-9187ea8c0498
- `[TUF]` Data-ink and chartjunk, origins (Tufte), EU Data Visualisation Guide. https://data.europa.eu/apps/data-visualisation-guide/chart-junk-and-data-ink-origins
- `[NNG-DASH]` NN/g, *Dashboards: Making Charts and Graphs Easier to Understand*. https://www.nngroup.com/articles/dashboards-preattentive/
- `[NNG-CLT]` NN/g, *Clutter in charts*. https://www.nngroup.com/articles/clutter-charts/
- `[NNG-GP]` NN/g, *Proximity Principle in Visual Design*. https://www.nngroup.com/articles/gestalt-proximity/
- `[NNG-F]` NN/g, *F-Shaped Pattern of Reading on the Web*. https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
- `[NNG-PD]` NN/g, *Progressive Disclosure*. https://www.nngroup.com/articles/progressive-disclosure/
- `[DD]` Datadog, *Executive dashboards*, https://www.datadoghq.com/blog/datadog-executive-dashboards/ ; *Effective dashboards guidelines*, https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md

**Tables, interaction, states**

- `[NNG-TBL]` NN/g, *Data Tables: Four Major User Tasks*. https://www.nngroup.com/articles/data-tables/
- `[STR-T]` Matt Ström-Awn, *Design better data tables*. https://mattstromawn.com/writing/tables/
- `[NNG-RT]` NN/g, *Response Times: The 3 Important Limits*. https://www.nngroup.com/articles/response-times-3-important-limits/
- `[NNG-FLT]` NN/g, *Applying Filters: Batch vs. Interactive*. https://www.nngroup.com/articles/applying-filters/
- `[NNG-TT]` NN/g, *Tooltip Guidelines*. https://www.nngroup.com/articles/tooltip-guidelines/
- `[NNG-SK]` NN/g, *Skeleton Screens 101*. https://www.nngroup.com/articles/skeleton-screens/
- `[NNG-ES]` NN/g, *Designing Empty States in Complex Applications*. https://www.nngroup.com/articles/empty-state-interface-design/
- `[SAAS-KPI]` SaaS UI, *KPI card UX patterns* (practitioner). https://www.saasui.design/blog/saas-metric-kpi-card-ux-patterns ; see also https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design

**Accessibility**

- `[W-143]` WCAG 2.2 SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- `[W-1411]` WCAG 2.2 SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- `[W-141]` WCAG 2.2 SC 1.4.1 Use of Color. https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- `[W-2413]` WCAG 2.2 SC 2.4.13 Focus Appearance. https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- `[W-258]` WCAG 2.2 SC 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- `[ECH]` Apache ECharts handbook, *Web Accessibility* (aria, decal). https://echarts.apache.org/handbook/en/best-practices/aria

**Colour**

- `[CBN-C]` IBM Carbon, *Data visualization color palettes*. https://carbondesignsystem.com/data-visualization/color-palettes/
- `[DW-C]` Datawrapper, *What to consider when choosing colors for data visualization*. https://www.datawrapper.de/blog/colors
- `[DW-SG]` Datawrapper, *A detailed guide to colors in data vis style guides* (FT, Economist and others). https://www.datawrapper.de/blog/colors-for-data-vis-style-guides
- `[DW-DM]` Datawrapper, *Automatic dark mode*. https://datawrapper.de/automatic-dark-mode
- `[ATL-DV]` Atlassian Design, *Data visualization color* (via search summary). https://atlassian.design/foundations/color-new/data-visualization-color
- `[GITLAB]` GitLab Pajamas, *Data visualization color* (via search summary). https://design.gitlab.com/data-visualization/color
- `[STRIPE]` Stripe, *Designing accessible color systems*. https://stripe.com/blog/accessible-color-systems
- `[GEIST]` Vercel Geist, *Colors*. https://vercel.com/geist/colors

**Typography, spacing, motion**

- `[CBN-T]` IBM Carbon, *Type sets*. https://carbondesignsystem.com/elements/typography/type-sets/
- `[CBN-S]` IBM Carbon, *Spacing*. https://carbondesignsystem.com/elements/spacing/overview/
- `[CBN-M]` IBM Carbon, *Motion*. https://carbondesignsystem.com/elements/motion/overview/
- `[BUT]` Matthew Butterick, *Practical Typography: Line length*. https://practicaltypography.com/line-length.html
- `[MDN-FVN]` MDN, *font-variant-numeric*. https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric

**Charts, text, annotation, small multiples, heatmaps, waterfalls**

- `[DW-T]` Datawrapper, *Text in data visualizations*. https://www.datawrapper.de/blog/text-in-data-visualizations/
- `[DW-ANN]` Datawrapper Academy, *How to create text annotations* and *Responsive annotations*. https://www.datawrapper.de/academy/how-to-create-text-annotations ; https://datawrapper.de/blog/better-more-responsive-annotations-in-datawrapper-data-visualizations
- `[DW-SM]` Datawrapper, *What to consider when creating small multiple line charts*. https://www.datawrapper.de/blog/what-to-consider-when-creating-small-multiple-line-charts
- `[EU-SM]` EU Data Visualisation Guide, *Preserving scales for comparisons*. https://data.europa.eu/apps/data-visualisation-guide/preserving-scales-for-comparisons
- `[ONS-SM]` ONS Service Manual, *Small multiple charts*. https://service-manual.ons.gov.uk/data-visualisation/chart-types/small-multiple-charts
- `[FT-VV]` Financial Times, *Visual Vocabulary* (chart-doctor). https://github.com/Financial-Times/chart-doctor/blob/main/visual-vocabulary/README.md
- `[ATL-HM]` Atlassian, *A complete guide to heatmaps*. https://www.atlassian.com/data/charts/heatmap-complete-guide
- `[MS]` Morningstar Design System, *Waterfall*. https://design.morningstar.com/systems/data-visualization/common-charts/waterfall
- `[DOMO]` Domo, *Waterfall charts*. https://www.domo.com/learn/charts/waterfall-charts
- `[SAP-WF]` SAP Fiori, *Waterfall chart usage*. https://www.sap.com/design-system/fiori-design-web/v1-84/ui-elements/waterfall-chart/usage
- `[IBCS]` IBCS Standards v1.2, https://www.ibcs.com/wp-content/uploads/2026/06/IBCS_v1-2_2024-05-16.pdf ; SAP, *IBCS*, https://www.sap.com/design-system/sac-dashboard-design-best-practices/ibcs (via search summary)

**Forecasts and uncertainty**

- `[WIL]` Claus O. Wilke, *Fundamentals of Data Visualization*, ch. 16 *Visualizing uncertainty*. https://clauswilke.com/dataviz/visualizing-uncertainty.html
- `[SWD]` Storytelling with Data, *When to use a dotted line*. https://www.storytellingwithdata.com/blog/2018/5/8/when-to-use-a-dotted-line
- `[DW-CI]` Datawrapper Academy, *How to show confidence intervals in line charts*. https://www.datawrapper.de/academy/how-to-show-confidence-intervals-in-datawrapper-line-charts
- `[BOE]` Bank of England Staff Working Paper (2026), *Anchors aweigh? The effect of communicating forecast uncertainty*. https://www.bankofengland.co.uk/working-paper/2026/anchors-aweigh-the-effect-of-communicating-forecast-uncertainty
- `[BOE-BU]` Bank Underground (2023), *Unknown measures* (90 % fan). https://bankunderground.co.uk/2023/07/13/unknown-measures-assessing-uncertainty-around-uk-inflation-using-a-new-inflation-at-risk-model/
- `[OBR]` OBR, *Presenting uncertainty in our forecasts* (80 % bands). https://obr.uk/box/presenting-uncertainty-in-our-forecasts/
- `[SCIAM]` Hullman and Christiansen, *How to get better at embracing unknowns*, Scientific American (2019). https://www.scientificamerican.com/article/how-to-get-better-at-embracing-unknowns/
- `[KAY]` Kay, Kola, Hullman, Munson, *When(ish) is My Bus?* (CHI 2016), https://idl.uw.edu/papers/when-ish-is-my-bus ; Fernandes et al., *Uncertainty Displays Using Quantile Dotplots or CDFs Improve Transit Decision-Making* (CHI 2018), https://mucollective.northwestern.edu/project/uncertainty-bus

**Products (2025–2026)**

- `[LIN]` Linear, *How we redesigned the Linear UI*. https://linear.app/now/how-we-redesigned-the-linear-ui
- `[LR]` LogRocket, *Linear design: the SaaS design trend*. https://blog.logrocket.com/ux-design/linear-design
- `[STR-S]` Matt Ström-Awn, *Stripe Merchant Dashboard*. https://mattstromawn.com/projects/stripe-dashboard/
- `[PULSE]` Salesforce, *Tableau Pulse*, https://www.salesforce.com/products/tableau-pulse/ ; Tableau, *Top new Pulse releases* (Aug 2025), https://www.tableau.com/blog/top-new-tableau-pulse-feature-releases-know
- `[HEX]` Hex, *Data apps*. https://www.hex.tech/product/data-apps/
- `[RELEX]` RELEX, *Demand Planning & Sensing RFP answers*. https://www.relexsolutions.com/relex-demand-planning-and-sensing-rfp/
- `[O9]` o9 Solutions, *How to improve your demand plan, part II*. https://o9solutions.com/articles/part-ii-how-to-improve-your-demand-plan
- `[KX]` Kinaxis, *Maestro overview brochure* (2024). https://www.kinaxis.com/sites/default/files/2024-09/Kinaxis-Brochure-Maestro-Overview.pdf
- `[ANA]` Anaplan Community, *UX best practices for building impactful dashboards* (practitioner). https://community.anaplan.com/discussion/160857/ux-best-practices-for-building-impactful-dashboards-in-anaplan-part-1

**Research limits**

- Some primary pages could not be read: Material 3 motion tokens and Atlassian data-viz colour are JS-rendered; the Observable colour blog returned HTTP 429; the SAP Fiori pages returned 403; the Economist chart guide now redirects to a design-system shell.
- The FT Visual Vocabulary README returned HTTP 503. `[FT-VV]` is cited only for its well-known
  organisation of chart types by the relationship being shown.
- The waterfall guidance (`[MS] [DOMO] [SAP-WF]`) comes from search summaries of those pages.
- Claims from those sources are marked "via search summary", or are replaced by Carbon equivalents.
- Row height (TB6) and the at-most-5-gridlines heuristic (CH6) are practitioner conventions, not standards.
