// O7 Data download: the bundle files with sizes and SHA-256, the pipeline outputs they came from (provenance), and
// CSV extracts generated in the browser for the current selection (monthly series, forecast rows with quantiles,
// history cells, and the submission file in its contract format).
import { useState } from "react";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { cellFlags } from "../components/Lineage";
import { Card, DataTable, Info, download, type Column } from "../components/ui";
import { fetchJson } from "../data/load";
import { filterLabel } from "../data/model";
import type { ForecastDetail } from "../data/types";

const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(1)} kB`);
const csv = (rows: (string | number | null)[][]) => rows.map((r) => r.map((v) => (v === null ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");

export default function Downloads() {
  const { m, filters } = useApp();
  const { h, fc, runs, segs } = useSelection();
  const [busy, setBusy] = useState<string | null>(null);
  const meta = m.meta;
  const files = meta.files;
  type F = (typeof files)[number];
  const fcols: Column<F>[] = [
    { key: "path", label: "File", value: (f) => f.path, render: (f) => <a href={`./data/${f.path}`} download>{f.path}</a> },
    { key: "bytes", label: "Size", value: (f) => f.bytes, render: (f) => kb(f.bytes), num: true },
    { key: "sha", label: "SHA-256", value: (f) => f.sha256, render: (f) => <code className="tiny">{f.sha256.slice(0, 16)}…</code> },
  ];
  const sources = Object.entries(meta.sources).map(([name, s]) => ({ name, ...s, sha: meta.source_sha256[name] }));
  type S = (typeof sources)[number];
  const scols: Column<S>[] = [
    { key: "name", label: "Input", value: (s) => s.name },
    { key: "path", label: "Path under outputs/", value: (s) => s.path, render: (s) => <code className="small">{s.path}</code> },
    { key: "prov", label: "Status", value: (s) => (s.provisional ? "provisional" : "final"), render: (s) => <span className={`badge ${s.provisional ? "warn" : "ok"}`}>{s.provisional ? "provisional" : "final"}</span> },
    { key: "sha", label: "SHA-256", value: (s) => s.sha, render: (s) => <code className="tiny">{s.sha.slice(0, 16)}…</code> },
  ];
  const pipe = Object.entries(meta.pipeline_sha256).map(([path, sha]) => ({ path, sha }));
  type P = (typeof pipe)[number];
  const pcols: Column<P>[] = [
    { key: "path", label: "Pipeline output", value: (p) => p.path, render: (p) => <code className="small">{p.path}</code> },
    { key: "sha", label: "SHA-256 (manifest)", value: (p) => p.sha, render: (p) => <code className="tiny">{p.sha.slice(0, 24)}…</code> },
  ];
  const label = filterLabel(m, filters).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60);

  const monthly = () => {
    const rows: (string | number | null)[][] = [["month", "part", "shipped_units", "unconstrained_demand", "latent_demand", "imputed_cells", "forecast_submitted", "p10", "p50", "p90"]];
    for (let i = 0; i < m.nMonths; i++) {
      if (i <= m.asOf) rows.push([m.months[i], "history", h.shipped[i], Math.round(h.demand[i] * 10) / 10, Math.round(h.latent[i] * 10) / 10, h.imputed[i], null, null, null, null]);
      else {
        const k = i - m.w0;
        rows.push([m.months[i], "forecast", null, null, null, null, fc.fc[k], Math.round(fc.p10[k]), Math.round(fc.p50[k]), Math.round(fc.p90[k])]);
      }
    }
    download(`monthly_${label}.csv`, csv(rows));
  };
  const forecastRows = async () => {
    setBusy("forecast");
    const d = await fetchJson<ForecastDetail>("forecast_detail.json");
    const rows: (string | number | null)[][] = [["date", "sku_id", "region", "channel", "customer", "forecast", "mean", "p10", "p50", "p90", "latent_mean", "price_usd", "structural_zero_reason"]];
    for (const r of runs) {
      const s = m.rSeries[r];
      for (let k = 0; k < m.rLen[r]; k++) {
        const i = m.rOff[r] + k;
        rows.push([m.months[m.rStart[r] + k], m.dims.skus.id[m.sSku[s]], m.dims.regions[m.sRegion[s]], m.dims.channels[m.sChannel[s]], m.dims.customers[m.sCustomer[s]], m.fc[i], m.mean[i], d.p10[i], d.p50[i], d.p90[i], d.latent_mean[i], m.price[i], m.zero[i] > 0 ? m.zeroReasons[m.zero[i] - 1] : null]);
      }
    }
    download(`forecast_rows_${label}.csv`, csv(rows));
    setBusy(null);
  };
  const historyCells = () => {
    const rows: (string | number | null)[][] = [["date", "sku_id", "region", "channel", "customer_at_time", "shipped_units", "unconstrained_demand", "latent_demand", "flags"]];
    for (const g of segs) {
      const s = m.gSeries[g];
      for (let k = 0; k < m.gLen[g]; k++) {
        const i = m.gOff[g] + k;
        rows.push([m.months[m.gStart[g] + k], m.dims.skus.id[m.sSku[s]], m.dims.regions[m.sRegion[s]], m.dims.channels[m.sChannel[s]], m.dims.customers[m.gCustomer[g]], Number.isNaN(m.u[i]) ? null : m.u[i], m.d[i], Math.round(m.latent[i] * 100) / 100, cellFlags(m.f[i], m.bit, m.accumMask).join("; ")]);
      }
    }
    download(`history_cells_${label}.csv`, csv(rows));
  };
  const submission = () => {
    const rows: (string | number | null)[][] = [["Date", "SKU_ID", "Region", "Units_Sold_Forecast"]];
    for (let r = 0; r < m.nRun; r++) {
      const s = m.rSeries[r];
      for (let k = 0; k < m.rLen[r]; k++) rows.push([m.months[m.rStart[r] + k], m.dims.skus.id[m.sSku[s]], m.dims.regions[m.sRegion[s]], m.fc[m.rOff[r] + k]]);
    }
    download("submission.csv", csv(rows));
  };
  const nCells = segs.reduce((a, g) => a + m.gLen[g], 0);
  const nRows = runs.reduce((a, r) => a + m.rLen[r], 0);
  return (
    <>
      <Card title="Extracts of the current selection" sub={`${filterLabel(m, filters)} — generated in your browser from the bundle; nothing is sent anywhere.`} info={<Info what="CSV files built from the same data every view shows, so a downloaded number always matches the screen." />}>
        <div className="grid g2" style={{ gap: 12 }}>
          {[
            { t: "Monthly history and forecast", d: `${m.nMonths} rows: shipped, unconstrained and latent demand, imputed cells, submitted forecast and P10 / P50 / P90 of the aggregate.`, f: monthly },
            { t: "Forecast rows with quantiles", d: `${nRows.toLocaleString("en-US")} rows: submitted forecast, mean, row P10 / P50 / P90, latent demand, price and structural-zero reason.`, f: forecastRows },
            { t: "History cells", d: `${nCells.toLocaleString("en-US")} rows: shipped and unconstrained demand per SKU × region × month with the cleaning and demand flags spelled out.`, f: historyCells },
            { t: "submission.csv (all rows)", d: `${meta.submission.rows.toLocaleString("en-US")} rows in test.csv order: Date, SKU_ID, Region, Units_Sold_Forecast — identical to the pipeline's file (checked at export).`, f: submission },
          ].map((x) => (
            <div key={x.t} className="card" style={{ boxShadow: "none", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <b>{x.t}</b>
                <div className="small muted">{x.d}</div>
              </div>
              <button type="button" className="btn primary" onClick={() => void x.f()} disabled={busy !== null}>
                {busy === "forecast" && x.f === forecastRows ? "Preparing…" : "Download CSV"}
              </button>
            </div>
          ))}
        </div>
        <p className="small muted">The anomaly register, exception inbox, data-quality checks and every table have their own “Download CSV” button in their views.</p>
      </Card>
      <div className="grid g2">
        <Card title="Bundle files" sub="What the app loads: JSON written by `python -m celeris export` to dashboard/public/data." info={<Info what="Every file of the data bundle with its size and SHA-256 (also in meta.json)." source="meta.json (files)" />}>
          <DataTable rows={files} cols={fcols} pageSize={12} csvName="bundle_files.csv" />
        </Card>
        <div className="grid" style={{ gap: 16 }}>
          <Card title="Modelling inputs" sub={meta.provisional ? "Some inputs are provisional stand-ins (dev only)." : "All modelling inputs are the final pipeline files."} info={<Info what="Which file fed each part of the bundle, and whether it was the real modelling output or the provisional stand-in." source="meta.json (sources)" />}>
            <DataTable rows={sources} cols={scols} pageSize={8} />
          </Card>
          <Card title="Pipeline provenance" sub={`celeris ${meta.package_version} · bundle v${meta.bundle_version} · hashes from outputs/quality/manifest.json`}>
            <DataTable rows={pipe} cols={pcols} pageSize={8} csvName="pipeline_hashes.csv" />
          </Card>
        </div>
      </div>
    </>
  );
}
