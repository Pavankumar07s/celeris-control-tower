// O1 Macro lead / lag (history).  Question: which public indicator should a planner watch for each family, with
// how many months of warning, and does the link hold over time?
//  lede (computed headline: the strongest stable driver | hero: families with a stable driver)
//  -> family x indicator matrix (click a cell)  -> lag profile by era | model-free check on one axis
//  -> indicator paths into the window (small multiples)  -> EV shift by powertrain | per-SKU sensitivities.
import { useMemo } from "react";
import { useApp } from "../app/context";
import { EChart } from "../charts/EChart";
import { Tabs } from "../components/controls";
import { HeroFigure, Lede, Meter } from "../components/Figure";
import { Module } from "../components/Module";
import { ErrorState, Loading } from "../components/states";
import { DataTable, type Column } from "../components/tables";
import { fmt1, fmtFixed, fmtPct, fmtSignedPct, monthName } from "../data/format";
import { useResource } from "../data/load";
import type { MacroFile } from "../data/types";
import { countWord, render } from "../insights/headlines";
import { IND, indName, indShort } from "../insights/indicators";
import { CHECK_TEMPLATES, EV_TEMPLATES, LAG_TEMPLATES, MACRO_TEMPLATES, MATRIX_TEMPLATES, PATH_TEMPLATES, SENS_TEMPLATES, STABLE_R, cell, eraLabel, macroFacts, sensRows, type SensRow } from "../insights/macro";
import { checkOption, evOption, lagOption, matrixOption, sensMedians, sensOption } from "./g2/macroCharts";
import "./g2/g2.css";
import { useElementWidth } from "../app/hooks";

export default function Macro() {
  const { m, theme, filters, params, setParam } = useApp();
  const mr = useResource<MacroFile>("macro.json");
  const mf = mr.data;
  const [wref, width] = useElementWidth();
  const narrow = width > 0 && width < 640;

  const facts = useMemo(() => (mf ? macroFacts(m, mf, filters.family) : null), [mf, m, filters.family]);

  // ---- the selected cell: URL `mx=<family code>.<indicator key>`, else the headline's driver ---------------------
  const sel = useMemo(() => {
    if (!mf || !facts) return { f: 0, k: 0 };
    const mx = params.get("mx");
    if (mx) {
      const [code, key] = mx.split(".");
      const f = m.dims.families.code.indexOf(code);
      const k = mf.indicators.indexOf(key);
      if (f >= 0 && k >= 0 && (filters.family === null || filters.family === f)) return { f, k };
    }
    if (facts.lead) return { f: facts.lead.f, k: facts.lead.k };
    const f = filters.family ?? 0;
    const mine = facts.cells.filter((c) => c.f === f && c.driver);
    const pick = mine.length ? mine.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a)) : facts.cells.filter((c) => c.f === f).reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
    return { f, k: pick.k };
  }, [mf, facts, params, m, filters.family]);
  const select = (f: number, k: number) => setParam({ mx: `${m.dims.families.code[f]}.${mf?.indicators[k] ?? ""}` }, true);

  const visCells = useMemo(() => (facts ? (filters.family === null ? facts.cells : facts.cells) : []), [facts, filters.family]);
  const matrix = useMemo(() => (mf && facts ? matrixOption(theme, m, mf.indicators, visCells, sel, narrow) : null), [mf, facts, theme, m, visCells, sel, narrow]);
  const c = mf ? cell(mf, sel.f, sel.k) : null;
  const lagOpt = useMemo(() => (mf && c ? lagOption(theme, mf.leadlag.corr[sel.f][sel.k], mf.leadlag.eras, c.lag) : null), [mf, c?.lag, theme, sel.f, sel.k]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- model-free check: the whole family's latent demand (all regions), as the lead / lag analysis uses -------------
  const famLatent = useMemo(() => {
    const a = new Float64Array(m.asOf + 1);
    for (let g = 0; g < m.nSeg; g++) {
      if (m.sFamily[m.gSeries[g]] !== sel.f) continue;
      for (let j = 0; j < m.gLen[g]; j++) a[m.gStart[g] + j] += m.latent[m.gOff[g] + j];
    }
    return a;
  }, [m, sel.f]);
  const check = useMemo(() => (mf && c ? checkOption(theme, m, famLatent, mf.values[mf.indicators[sel.k]], c.lag, m.dims.families.name[sel.f], mf.indicators[sel.k]) : null), [mf, c?.lag, theme, m, famLatent, sel.f, sel.k]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- indicator paths into the window ---------------------------------------------------------------------------
  const paths = useMemo(() => {
    if (!mf) return [];
    return mf.indicators.map((key, k) => {
      const v = mf.values[key];
      const last = v[m.asOf];
      const end = v[m.nMonths - 1];
      const rep = mf.repaired.month.filter((_, i) => mf.repaired.indicator[i] === key);
      return { key, k, v, last: last ?? NaN, end: end ?? NaN, chg: last !== null && end !== null && last !== 0 ? end / last - 1 : NaN, rep };
    });
  }, [mf, m]);

  // ---- EV shift by powertrain (filters apply), rolling 12-month latent demand, 2023 = 100 ------------------------
  const ev = useMemo(() => {
    if (!mf) return null;
    const kinds = ["EV", "ICE", "Universal"];
    const sums = kinds.map(() => new Float64Array(m.asOf + 1));
    for (let g = 0; g < m.nSeg; g++) {
      const s = m.gSeries[g];
      if (filters.family !== null && m.sFamily[s] !== filters.family) continue;
      if (filters.sku !== null && m.sSku[s] !== filters.sku) continue;
      if (filters.region !== null && m.sRegion[s] !== filters.region) continue;
      if (filters.channel !== null && m.sChannel[s] !== filters.channel) continue;
      if (filters.customer !== null && m.gCustomer[g] !== filters.customer) continue;
      const k = kinds.indexOf(m.dims.skus.powertrain[m.sSku[s]] ?? "Universal");
      if (k < 0) continue;
      for (let j = 0; j < m.gLen[g]; j++) sums[k][m.gStart[g] + j] += m.latent[m.gOff[g] + j];
    }
    const y23 = m.months.indexOf("2023-01");
    const roll = (a: Float64Array) => {
      const r = Array.from(a, (_, i) => (i < 11 ? null : Array.from(a.subarray(i - 11, i + 1)).reduce((x, y) => x + y, 0)));
      const base = r.slice(y23, y23 + 12).reduce((x: number, y) => x + (y ?? 0), 0) / 12;
      return base > 0 ? r.map((x) => (x === null ? null : (x / base) * 100)) : null;
    };
    const evIdx = mf.values.ev_adoption_index;
    const evBase = evIdx ? (evIdx.slice(y23, y23 + 12).filter((x): x is number => x !== null).reduce((a, b) => a + b, 0) / 12) : 0;
    const lines = [
      { name: "EV SKUs", data: roll(sums[0]), color: theme.cat[6], width: 2, strong: true },
      { name: "ICE SKUs", data: roll(sums[1]), color: theme.cat[0], width: 2, strong: true },
      { name: "Universal SKUs", data: roll(sums[2]), color: theme.ink4, width: 1.5 },
      { name: "EV adoption", data: evIdx && evBase > 0 ? evIdx.slice(0, m.asOf + 1).map((x) => (x === null ? null : (x / evBase) * 100)) : null, color: theme.ink, width: 1 },
    ].filter((l): l is { name: string; data: (number | null)[]; color: string; width: number; strong: boolean } => l.data !== null);
    const at = (n: string) => lines.find((l) => l.name === n)?.data[m.asOf] ?? NaN;
    return { option: evOption(theme, m, lines), facts: { ev: at("EV SKUs"), ice: at("ICE SKUs"), uni: at("Universal SKUs"), adoption: at("EV adoption") } };
  }, [mf, m, theme, filters]);

  // ---- per-SKU sensitivities --------------------------------------------------------------------------------------
  const sd = useMemo(
    () =>
      mf
        ? mf.indicators.map((key) => {
            const v = mf.values[key].slice(0, m.asOf + 1).filter((x): x is number => x !== null);
            const mu = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
            return Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, v.length));
          })
        : [],
    [mf, m],
  );
  const sens = useMemo(() => (mf ? sensRows(m, mf, filters.family, filters.sku, sd) : []), [mf, m, filters.family, filters.sku, sd]);
  const sensOpt = useMemo(() => (mf && sens.length ? sensOption(theme, sens, mf.indicators, (k) => m.dims.skus.id[k]) : null), [mf, sens, theme, m]);
  const medians = useMemo(() => sensMedians(sens), [sens]);
  const sensView = params.get("sv") === "table" ? "table" : "plot";

  if (mr.loading && !mf) return <Loading what="macro indicators and the lead / lag table" height={360} />;
  if (mr.error || !mf || !facts || !c) return <ErrorState message={mr.error ?? "macro.json missing"} />;

  const fam = m.dims.families.name[sel.f];
  const ind = mf.indicators[sel.k];
  const headline = render(MACRO_TEMPLATES.headline, facts).text;
  const standfirst = render(MACRO_TEMPLATES.standfirst, facts).text;
  const nFam = m.dims.families.name.length;
  const scopeFams = filters.family === null ? m.dims.families.name.map((_, i) => i) : [filters.family];
  const stableIn = scopeFams.filter((f) => facts.stableFams.includes(f)).length;
  const lagFacts = { fam, ind, c };
  const checkFacts = { fam, ind, lag: c.lag, r: check?.r ?? NaN };
  type SR = SensRow;
  const scols: Column<SR>[] = [
    { key: "sku", label: "SKU", value: (r) => m.dims.skus.id[r.sku], id: true },
    { key: "g", label: "Channel group", value: (r) => (r.group === "aftermarket" ? "Aftermarket" : "Other channels") },
    { key: "i", label: "Indicator", value: (r) => indShort(mf.indicators[r.k]) },
    { key: "l", label: "Lags (months)", value: (r) => r.lags.join(", "), num: true },
    { key: "b", label: "Σ β per unit", value: (r) => Number(r.beta.toFixed(5)), render: (r) => fmtFixed(r.beta, 4), num: true },
    { key: "e", label: "Demand per +1 sd", value: (r) => Number(r.eff.toFixed(5)), render: (r) => fmtSignedPct(r.eff), num: true },
  ];

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label={filters.family === null ? "Families with a stable leading indicator" : `Stable drivers for ${m.dims.families.name[filters.family]}`}
            value={filters.family === null ? `${stableIn} of ${nFam}` : String(facts.cells.filter((x) => x.f === filters.family && x.stable).length)}
            unit={filters.family === null ? "families" : `of ${facts.cells.filter((x) => x.f === filters.family && x.driver).length} drivers`}
            visual={
              <Meter
                ariaLabel={`${stableIn} of ${scopeFams.length} families with a stable driver`}
                segments={
                  filters.family === null
                    ? scopeFams.map((f) => ({ value: 1, tone: facts.stableFams.includes(f) ? ("ink" as const) : ("rest" as const), label: `${m.dims.families.name[f]}: ${facts.stableFams.includes(f) ? "stable driver" : "no stable driver"}` }))
                    : facts.cells.filter((x) => x.f === filters.family && x.driver).sort((a, b) => Number(b.stable) - Number(a.stable)).map((x) => ({ value: 1, tone: x.stable ? ("ink" as const) : ("rest" as const), label: `${indShort(mf.indicators[x.k])} at lag ${x.lag}: ${x.stable ? "stable" : "not stable"}` }))
                }
              />
            }
            context={`Stable = a model driver whose correlation at its lag keeps its sign and |r| ≥ ${STABLE_R} in ${eraLabel(mf.leadlag.eras[1] ?? "")} and in ${eraLabel(mf.leadlag.eras[2] ?? "")}`}
            info={{
              what: "How many families follow a public indicator that the forecast can lean on: a driver the model selected whose link holds in both eras.",
              how: "Weighted correlation of the family's macro index (log demand over the model's expectation without the macro factor) with the standardised indicator lagged 0–12 months, per era; drivers come from the model's forward selection with the economic sign.",
              source: "macro.json (leadlag) ← features/macro_leadlag.csv",
            }}
          />
        }
      />

      <Module
        title={render(MATRIX_TEMPLATES.title, facts).text}
        dek={`Correlation of each family's macro index with each indicator ${monthName(m.months[0])} – ${monthName(m.months[m.asOf])}, at the model's lag for its drivers (ink outline) and at the strongest lag elsewhere. Click a cell to inspect it; the orange outline is the selection.`}
        info={{ what: "The family × indicator lead / lag matrix of the features stage.", how: "Positive r: demand rises after the indicator rises. The lag is in months the indicator leads demand.", source: "macro.json (leadlag)" }}
      >
        <div ref={wref} className={narrow ? "g2-scroll" : undefined}>
          {matrix && (
            <div style={narrow ? { minWidth: 600 } : undefined}>
            <EChart
              option={matrix}
              height={narrow ? 380 : 420}
              ariaLabel={`${render(MATRIX_TEMPLATES.title, facts).text}. Family by indicator correlation matrix.`}
              onClick={(e) => {
                const v = e.value as number[];
                if (Array.isArray(v)) select(v[1], v[0]);
              }}
            />
            </div>
          )}
        </div>
        {narrow && <p className="caption">Scroll sideways for all eight indicators.</p>}
        <p className="g2-sel" aria-live="polite">
          <span>
            Selected: <b>{fam}</b> × <b>{indName(ind)}</b>
          </span>
          <span>
            {c.driver ? `model driver at lag ${c.lag}` : `not a driver; strongest at lag ${c.lag}`}, r = {fmtFixed(c.r, 2)}
          </span>
        </p>
      </Module>

      <div className="cols-5-7">
        <Module
          title={render(LAG_TEMPLATES.title, lagFacts).text}
          dek={`Correlation at every lag, 0 to 12 months, for ${fam} and ${indName(ind)}: ${eraLabel(mf.leadlag.eras[0])} in ink, the two eras in grey. The dotted rule is the ${c.driver ? "model's" : "strongest"} lag.`}
          info={{ what: "Is the lead stable? The same correlation computed over the whole period and over each era.", how: "A driver is stable when the two eras agree in sign and both reach |r| ≥ 0.5 at the driver's lag.", source: "macro.json (leadlag.corr)" }}
          keyItems={mf.leadlag.eras.map((e, i) => ({ kind: i === 0 ? ("line" as const) : ("thin" as const), color: ["var(--ink)", "var(--ink-3)", "var(--ink-4)"][i] ?? "var(--ink-3)", label: eraLabel(e) }))}
        >
          {lagOpt && <EChart option={lagOpt} height={290} ariaLabel={`${render(LAG_TEMPLATES.title, lagFacts).text}.`} />}
        </Module>
        <Module
          title={render(CHECK_TEMPLATES.title, checkFacts).text}
          dek={`${fam} latent demand (all regions), 12-month growth, against the indicator's 12-month change ${c.lag ? `${c.lag} month${c.lag === 1 ? "" : "s"} earlier` : "in the same month"}, ${monthName(m.months[12 + c.lag])} – ${monthName(m.months[m.asOf])}. Both in standard deviations, so one axis serves.`}
          info={{ what: "An independent look at the raw data, without the model: if the indicator leads, the two lines move together after the shift.", how: "Latent demand removes the ordering cycles; both series are z-scored over their own months; r is computed on the months both exist.", source: "history.json, macro.json (values)" }}
          keyItems={[
            { kind: "line", color: "var(--ink)", label: `${fam} demand growth` },
            { kind: "line", color: "var(--cat-7)", label: `${indShort(ind)} change${c.lag ? `, ${c.lag} month${c.lag === 1 ? "" : "s"} earlier` : ""}` },
          ]}
        >
          {check && <EChart option={check.option} height={290} ariaLabel={`${render(CHECK_TEMPLATES.title, checkFacts).text}.`} />}
        </Module>
      </div>

      <Module
        title={render(PATH_TEMPLATES.title, { items: paths, inds: mf.indicators, endMonth: m.months[m.nMonths - 1] }).text}
        dek={`Each indicator, ${monthName(m.months[0])} – ${monthName(m.months[m.nMonths - 1])}, on its own scale: the cleaned history in ink, the supplied path the forecast uses as a known input in orange, rings where a value was repaired. Click one to inspect its column.`}
        info={{ what: "The macro inputs of the forecast: history and the path assumed through the window.", how: "Values from the cleaned indicator file; repaired cells (unit or scale errors, gaps) are listed in the change log.", source: "macro.json (values, repaired) ← clean/macro_clean.csv, quality/macro_change_log.csv" }}
      >
        <div className="g2-paths">
          {paths.map((p) => (
            <button key={p.key} type="button" className="g2-path" aria-pressed={p.k === sel.k} onClick={() => select(sel.f, p.k)} aria-label={`${indName(p.key)}: ${fmt1(p.last)} in ${monthName(m.months[m.asOf])}, ${fmt1(p.end)} by ${monthName(m.months[m.nMonths - 1])}; inspect`}>
              <h4>{indName(p.key)}</h4>
              <span className="stat">
                <span>
                  {fmt1(p.last)} to <b>{fmt1(p.end)}</b>
                </span>
                <span>{Number.isFinite(p.chg) ? fmtSignedPct(p.chg) : "–"}</span>
              </span>
              <PathMini v={p.v} asOf={m.asOf} rep={p.rep} />
              <span className="caption">{IND[p.key] ? `In ${IND[p.key].unit}; ` : ""}{p.rep.length ? `${countWord(p.rep.length)} ${p.rep.length === 1 ? "value" : "values"} repaired` : "no repairs"}</span>
            </button>
          ))}
          <div className="g2-paths-axis">
            <span>{monthName(m.months[0])}</span>
            <span>Each on its own scale; the wash is the forecast window</span>
            <span>{monthName(m.months[m.nMonths - 1])}</span>
          </div>
        </div>
      </Module>

      <div className="cols-7-5">
        <Module
          title={ev ? render(EV_TEMPLATES.title, ev.facts).text : "Demand by powertrain"}
          dek={`Rolling 12-month latent demand by powertrain${filters.family !== null || filters.region !== null || filters.channel !== null ? " within the filters" : ""}, ${monthName(m.months[11])} – ${monthName(m.months[m.asOf])}, each indexed to its 2023 average = 100, with the EV adoption index on the same base.`}
          info={{ what: "The shift to electric vehicles in the order book: demand for EV, ICE and universal SKUs against EV adoption.", how: "Each powertrain's rolling 12-month sum of latent demand divided by its 2023 average; the EV adoption index divided by its own 2023 average.", source: "history.json, dims.json (powertrain), macro.json" }}
          keyItems={[
            { kind: "line", color: "var(--cat-7)", label: "EV SKUs" },
            { kind: "line", color: "var(--cat-1)", label: "ICE SKUs" },
            { kind: "line", color: "var(--ink-4)", label: "Universal SKUs" },
            { kind: "thin", color: "var(--ink)", label: "EV adoption index" },
          ]}
        >
          {ev && <EChart option={ev.option} height={Math.max(300, medians.length * 38 + 70)} ariaLabel={`${render(EV_TEMPLATES.title, ev.facts).text}.`} />}
        </Module>
        <Module
          title={render(SENS_TEMPLATES.title, { rows: medians, inds: mf.indicators }).text}
          dek={`Change in a SKU's latent demand for a permanent +1 standard deviation move in each indicator, summed over its lags; one dot per SKU × channel group${filters.family !== null ? ` in ${m.dims.families.name[filters.family]}` : ""}, the ink tick is the median. These are the what-if's inputs.`}
          tools={<Tabs ariaLabel="Show as" value={sensView} options={[{ value: "plot", label: "Dots" }, { value: "table", label: "Table" }]} onChange={(v) => setParam({ sv: v === "plot" ? null : v }, true)} className="g2-tabs-tight" />}
          info={{ what: "The model's per-SKU response of latent demand to each indicator, used by the forecast's macro factor and the what-if view.", how: "β per unit of the cleaned indicator at each lag, by channel group (Aftermarket separately); effect = exp(Σβ × sd) − 1 with the indicator's 2019–26 standard deviation.", source: "macro.json (sensitivity) ← forecast/macro_sensitivity.csv" }}
        >
          {sens.length === 0 ? (
            <p className="caption" style={{ marginTop: 12 }}>
              No SKU in this selection responds to an indicator.
            </p>
          ) : sensView === "plot" ? (
            sensOpt && <EChart option={sensOpt} height={Math.max(220, medians.length * 38 + 50)} ariaLabel={`${render(SENS_TEMPLATES.title, { rows: medians, inds: mf.indicators }).text}. Dot plot of ${sens.length} sensitivities.`} />
          ) : (
            <DataTable rows={sens} cols={scols} pageSize={10} csvName="macro_sensitivity_selection.csv" initialSort={{ key: "e", desc: false }} ariaLabel="Per-SKU sensitivities" />
          )}
        </Module>
      </div>

      <aside className="colophon" aria-label="Method">
        <span>
          <b>Lead / lag</b> correlation of the family macro index with the indicator at lags 0–12, per era
        </span>
        <span>
          <b>Drivers</b> forward selection with the economic sign, in the features stage
        </span>
        <span>
          <b>Stable</b> same sign and |r| ≥ {STABLE_R} in both eras; {fmtPct(stableIn / Math.max(1, scopeFams.length), 0)} of families in view
        </span>
      </aside>
    </>
  );
}

/** One indicator path: history in ink, the window in orange over a wash, rings on repaired months. */
function PathMini({ v, asOf, rep }: { v: (number | null)[]; asOf: number; rep: number[] }) {
  const vals = v.filter((x): x is number => x !== null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const W = 200;
  const H = 76;
  const n = v.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (val: number) => H - 2 - ((val - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 4);
  const path = (a: number, b: number) => {
    let d = "";
    let pen = false;
    for (let i = a; i <= b; i++) {
      const val = v[i];
      if (val === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  return (
    <span className="mini">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <rect x={x(asOf)} y={0} width={W - x(asOf)} height={H} fill="var(--accent-wash)" />
        <path d={path(0, asOf)} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={path(asOf, n - 1)} fill="none" stroke="var(--accent)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {rep.filter((i) => v[i] !== null).map((i, j) => (
        <i key={`${i}-${j}`} className="ring" style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(v[i] as number) / H) * 100}%` }} />
      ))}
    </span>
  );
}
