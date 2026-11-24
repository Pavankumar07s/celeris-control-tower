// O7 Data download (act): take the numbers away, and trust them.
//  lede (computed headline + standfirst | hero: checksums re-verified in this browser, with a meter)
//  -> extracts of the current selection (monthly series, forecast rows with quantiles, history cells with
//     their flags spelled out) | the submission file (contract format, identical to the bundle)
//  -> bundle manifest (path, size, SHA-256 with copy, the live check) | modelling inputs | pipeline outputs
//  -> colophon.  Every CSV is generated in the browser from the arrays the views draw; nothing is uploaded.
import { useMemo, useState } from "react";
import { useApp } from "../app/context";
import { useSelection } from "../app/hooks";
import { cellFlags } from "../components/Lineage";
import { Button, StatusPill } from "../components/controls";
import { HeroFigure, Lede, Meter } from "../components/Figure";
import { CheckCircle, CrossCircle, Download } from "../components/icons";
import { Module } from "../components/Module";
import { toast } from "../components/overlays";
import { DataTable, download, type Column } from "../components/tables";
import { fmtInt, fmtBytes } from "../data/format";
import { fetchJson } from "../data/load";
import { filterLabel } from "../data/model";
import type { ForecastDetail } from "../data/types";
import { countWord, render, selectionWords } from "../insights/headlines";
import { downloadHeadline, DOWNLOAD_TEMPLATES, useChecksums } from "../insights/downloads";
import { CheckMark, HashCell } from "./g3/ui";
import "./g3/downloads.css";

type Cell = string | number | null;
const csv = (rows: Cell[][]) => rows.map((r) => r.map((v) => (v === null ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");

export default function Downloads() {
  const { m, filters } = useApp();
  const { h, fc, runs, segs } = useSelection();
  const meta = m.meta;
  const files = meta.files;
  const [run, setRun] = useState(0);
  const { state: checks, supported } = useChecksums(files, run);
  const [busy, setBusy] = useState<string | null>(null);
  const [built, setBuilt] = useState<Record<string, number>>({});

  const ok = files.filter((f) => checks[f.path] === "ok").length;
  const bad = files.filter((f) => checks[f.path] === "bad").length;
  const pending = files.filter((f) => checks[f.path] === "pending").length;
  const bytes = files.reduce((a, f) => a + f.bytes, 0);
  const sources = useMemo(() => Object.entries(meta.sources).map(([name, s]) => ({ name, ...s, sha: meta.source_sha256[name] ?? "" })), [meta]);
  const pipe = useMemo(() => Object.entries(meta.pipeline_sha256).map(([path, sha]) => ({ path, sha })), [meta]);
  const finalInputs = sources.filter((s) => !s.provisional).length;
  const facts = {
    hash: meta.source_sha256.forecast ? meta.source_sha256.forecast.slice(0, 8) : null,
    n: files.length,
    bytes,
    ok,
    bad,
    pending,
    supported,
    outputs: pipe.length,
    inputs: sources.length,
    finalInputs,
    version: meta.package_version,
  };
  const headline = downloadHeadline(facts);
  const standfirst = render(DOWNLOAD_TEMPLATES.standfirst, facts).text;

  // ---- extracts of the selection
  const sel = selectionWords(m, filters);
  const label = filterLabel(m, filters).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60);
  const nCells = segs.reduce((a, g) => a + m.gLen[g], 0);
  const nRows = runs.reduce((a, r) => a + m.rLen[r], 0);
  const save = (key: string, name: string, text: string) => {
    download(name, text);
    setBuilt((b) => ({ ...b, [key]: new Blob([text]).size }));
    toast(`${name} saved`);
  };
  const monthly = () => {
    const rows: Cell[][] = [["month", "part", "shipped_units", "unconstrained_demand", "latent_demand", "imputed_cells", "forecast_submitted", "p10", "p50", "p90"]];
    for (let i = 0; i < m.nMonths; i++) {
      if (i <= m.asOf) rows.push([m.months[i], "history", h.shipped[i], Math.round(h.demand[i] * 10) / 10, Math.round(h.latent[i] * 10) / 10, h.imputed[i], null, null, null, null]);
      else {
        const k = i - m.w0;
        rows.push([m.months[i], "forecast", null, null, null, null, fc.fc[k], Math.round(fc.p10[k]), Math.round(fc.p50[k]), Math.round(fc.p90[k])]);
      }
    }
    save("monthly", `monthly_${label}.csv`, csv(rows));
  };
  const forecastRows = async () => {
    setBusy("forecast");
    try {
      const d = await fetchJson<ForecastDetail>("forecast_detail.json");
      const rows: Cell[][] = [["date", "sku_id", "region", "channel", "customer", "forecast", "mean", "p10", "p50", "p90", "latent_mean", "price_usd", "structural_zero_reason"]];
      for (const r of runs) {
        const s = m.rSeries[r];
        for (let k = 0; k < m.rLen[r]; k++) {
          const i = m.rOff[r] + k;
          rows.push([m.months[m.rStart[r] + k], m.dims.skus.id[m.sSku[s]], m.dims.regions[m.sRegion[s]], m.dims.channels[m.sChannel[s]], m.dims.customers[m.sCustomer[s]], m.fc[i], m.mean[i], d.p10[i], d.p50[i], d.p90[i], d.latent_mean[i], m.price[i], m.zero[i] > 0 ? m.zeroReasons[m.zero[i] - 1] : null]);
        }
      }
      save("forecast", `forecast_rows_${label}.csv`, csv(rows));
    } catch (e) {
      toast(`Could not read forecast_detail.json: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const historyCells = () => {
    const rows: Cell[][] = [["date", "sku_id", "region", "channel", "customer_at_time", "shipped_units", "unconstrained_demand", "latent_demand", "flags"]];
    for (const g of segs) {
      const s = m.gSeries[g];
      for (let k = 0; k < m.gLen[g]; k++) {
        const i = m.gOff[g] + k;
        rows.push([m.months[m.gStart[g] + k], m.dims.skus.id[m.sSku[s]], m.dims.regions[m.sRegion[s]], m.dims.channels[m.sChannel[s]], m.dims.customers[m.gCustomer[g]], Number.isNaN(m.u[i]) ? null : m.u[i], m.d[i], Math.round(m.latent[i] * 100) / 100, cellFlags(m.f[i], m.bit, m.accumMask).join("; ")]);
      }
    }
    save("history", `history_cells_${label}.csv`, csv(rows));
  };
  const submission = () => {
    const rows: Cell[][] = [["Date", "SKU_ID", "Region", "Units_Sold_Forecast"]];
    for (let r = 0; r < m.nRun; r++) {
      const s = m.rSeries[r];
      for (let k = 0; k < m.rLen[r]; k++) rows.push([m.months[m.rStart[r] + k], m.dims.skus.id[m.sSku[s]], m.dims.regions[m.sRegion[s]], m.fc[m.rOff[r] + k]]);
    }
    save("submission", "submission.csv", csv(rows));
  };
  const extracts = [
    { key: "monthly", t: "Monthly history and forecast", d: "Shipped, unconstrained and latent demand, rebuilt cells, then the submitted forecast with the P10, P50 and P90 of the aggregate, on one continuous month axis.", rows: m.nMonths, cols: 10, f: monthly },
    { key: "forecast", t: "Forecast rows with quantiles", d: "One row per SKU, region and month: submitted forecast, mean, row P10, P50 and P90, latent demand, price and the structural-zero reason.", rows: nRows, cols: 13, f: () => void forecastRows() },
    { key: "history", t: "History cells with their flags", d: "Shipped and unconstrained demand per SKU, region, customer at the time and month, with every cleaning and demand flag spelled out.", rows: nCells, cols: 9, f: historyCells },
  ];
  const scope = sel.all ? "" : sel.demandSubject.replace(/^Demand/, "");
  const extractTitle = nRows + nCells > 0 ? `${fmtInt(nRows)} forecast rows and ${fmtInt(nCells)} history cells${scope} are ready as CSV` : `Nothing${scope} to extract: widen the filters`;

  // ---- manifest tables
  type F = (typeof files)[number];
  const fcols: Column<F>[] = [
    { key: "path", label: "File", value: (f) => f.path, render: (f) => <a className="g3-file" href={`./data/${f.path}`} download>{f.path}</a> },
    { key: "bytes", label: "Size", value: (f) => f.bytes, render: (f) => fmtBytes(f.bytes), num: true },
    { key: "sha", label: "SHA-256", value: (f) => f.sha256, render: (f) => <HashCell hash={f.sha256} what={f.path} /> },
    { key: "check", label: "In this browser", value: (f) => checks[f.path] ?? "na", render: (f) => <CheckMark state={checks[f.path] ?? "na"} /> },
  ];
  type S = (typeof sources)[number];
  const scols: Column<S>[] = [
    { key: "name", label: "Input", value: (s) => s.path, render: (s) => <span className="g3-two"><b>{s.name.replace(/_/g, " ")}</b><code>{s.path}</code></span> },
    { key: "prov", label: "Status", value: (s) => (s.provisional ? "provisional" : "final"), render: (s) => (s.provisional ? <StatusPill tone="warn">Provisional</StatusPill> : <StatusPill tone="neutral" icon={<CheckCircle size={10} />}>Final</StatusPill>) },
    { key: "sha", label: "SHA-256", value: (s) => s.sha, render: (s) => (s.sha ? <HashCell hash={s.sha} n={8} what={s.path} /> : "–") },
  ];
  type P = (typeof pipe)[number];
  const pcols: Column<P>[] = [
    { key: "path", label: "Pipeline output under outputs/", value: (p) => p.path, render: (p) => <code className="g3-path">{p.path}</code> },
    { key: "sha", label: "SHA-256", value: (p) => p.sha, render: (p) => <HashCell hash={p.sha} n={8} what={p.path} /> },
  ];
  const manifestTitle = !supported
    ? `${fmtInt(files.length)} bundle files with their SHA-256 from meta.json`
    : pending > 0
      ? `Checking ${fmtInt(files.length)} files against the SHA-256 in meta.json`
      : bad > 0
        ? `${fmtInt(bad)} of ${fmtInt(files.length)} files do not match meta.json`
        : `All ${fmtInt(files.length)} files match the SHA-256 in meta.json`;
  const sub = meta.submission;

  return (
    <>
      <Lede
        headline={headline}
        standfirst={standfirst}
        figure={
          <HeroFigure
            label="Checksums verified in this browser"
            value={supported ? fmtInt(ok) : "–"}
            unit={`of ${fmtInt(files.length)} files`}
            visual={
              supported ? (
                <Meter
                  ariaLabel={`${fmtInt(ok)} files match, ${fmtInt(bad)} do not, ${fmtInt(pending)} still checking`}
                  segments={[
                    { value: ok, tone: "good", label: `${ok} match` },
                    { value: bad, tone: "crit", label: `${bad} mismatch` },
                    { value: pending, tone: "rest", label: `${pending} checking` },
                  ]}
                />
              ) : undefined
            }
            context={
              !supported ? (
                "Web Crypto is unavailable on this connection: the hashes are listed, not re-checked."
              ) : pending > 0 ? (
                `Hashing ${fmtInt(files.length - pending)} of ${fmtInt(files.length)} files…`
              ) : bad > 0 ? (
                <span className="g3-verdict bad">
                  <CrossCircle size={12} /> {fmtInt(bad)} mismatched: re-run <code>python -m celeris export</code>
                </span>
              ) : (
                <span className="g3-verdict">
                  <CheckCircle size={12} /> <b>{fmtBytes(bytes)}</b> re-hashed with SHA-256, every file matches
                </span>
              )
            }
            info={{
              what: "Each file of the data bundle is downloaded again and hashed with SHA-256 in your browser, then compared with the hash the export wrote into meta.json.",
              how: "Web Crypto (crypto.subtle.digest) over the raw bytes, three files at a time. A mismatch means the file changed after the export: re-run python -m celeris export.",
              source: "meta.json (files)",
            }}
          />
        }
      />

      <div className="cols-7-5">
        <Module
          title={extractTitle}
          dek={`Extracts of ${sel.all ? "every family, region, channel and customer" : filterLabel(m, filters)}, built in your browser from the bundle; nothing is uploaded. ISO months and full precision, ready for a spreadsheet.`}
          info={{ what: "CSV files built from the same arrays every view draws, so a downloaded number always matches the screen.", how: "Monthly sums use the same aggregation as the timelines; forecast rows add the row quantiles from forecast_detail.json.", source: "history.json, forecast.json, forecast_detail.json" }}
          foot="The anomaly register, the exception inbox, the data-quality checks and every ledger carry their own CSV button in their views."
        >
          <ul className="g3-extracts">
            {extracts.map((x) => (
              <li key={x.key}>
                <div className="g3-ex-text">
                  <b>{x.t}</b>
                  <span>{x.d}</span>
                </div>
                <div className="g3-ex-num">
                  <b>{fmtInt(x.rows)}</b>
                  <span>rows, {x.cols} columns</span>
                </div>
                <div className="g3-ex-act">
                  <Button size="sm" onClick={x.f} disabled={busy !== null || x.rows === 0}>
                    <Download size={13} /> {busy === x.key ? "Preparing…" : "Build CSV"}
                  </Button>
                  {built[x.key] !== undefined && (
                    <span className="g3-built">
                      <CheckCircle size={11} /> {fmtBytes(built[x.key])}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Module>

        <Module
          title={sub.matches_forecast ? "The submission file equals the bundle’s forecast, row for row" : "The submission file, in the contract format"}
          dek="All rows, whatever the filters: the file the pipeline submitted, rebuilt here in test.csv order."
          info={{ what: "submission.csv in the contract format (Date, SKU_ID, Region, Units_Sold_Forecast).", how: "Rebuilt from forecast.json in test.csv order; the export checks that it equals the pipeline's submission.csv and records the result in meta.json.", source: "forecast.json, meta.json (submission)" }}
        >
          <dl className="facts g3-sub">
            <dt>Rows</dt>
            <dd>{fmtInt(sub.rows)}</dd>
            <dt>Units forecast</dt>
            <dd>
              {fmtInt(sub.total_units)}
            </dd>
            <dt>Columns</dt>
            <dd>
              <code>Date, SKU_ID, Region, Units_Sold_Forecast</code>
            </dd>
            <dt>Check at export</dt>
            <dd>
              {sub.matches_forecast ? (
                <span className="g3-check ok">
                  <CheckCircle size={12} /> Identical to the bundle
                </span>
              ) : (
                <span className="g3-check bad">
                  <CrossCircle size={12} /> Differs from the bundle
                </span>
              )}
            </dd>
          </dl>
          <div className="g3-sub-act">
            <Button variant="primary" onClick={submission}>
              <Download size={14} /> Download submission.csv
            </Button>
            {built.submission !== undefined && (
              <span className="g3-built">
                <CheckCircle size={11} /> {fmtBytes(built.submission)}
              </span>
            )}
          </div>
        </Module>
      </div>

      <div className="cols-7-5">
        <Module
          className="g3-manifest"
          title={manifestTitle}
          dek={
            <>
              What the app loads: JSON written by <code>python -m celeris export</code> to <code>dashboard/public/data</code>, {fmtBytes(bytes)} in all. Click a file to download it as it is.
            </>
          }
          tools={
            supported ? (
              <Button size="sm" variant="quiet" onClick={() => setRun((r) => r + 1)} disabled={pending > 0}>
                Check again
              </Button>
            ) : undefined
          }
          info={{ what: "Every file of the data bundle with its size and SHA-256, and the result of re-hashing it in this browser.", how: "meta.json is written last by the export and lists the hash of every other file.", source: "meta.json (files)" }}
        >
          <DataTable rows={files} cols={fcols} pageSize={25} csvName="bundle_manifest.csv" ariaLabel="Bundle files" />
        </Module>
        <div className="stack">
          <Module
            className="g3-manifest"
            title={finalInputs === sources.length ? `All ${countWord(sources.length)} modelling inputs are final pipeline files` : `${fmtInt(sources.length - finalInputs)} of ${fmtInt(sources.length)} modelling inputs are provisional stand-ins`}
            dek="Which pipeline file fed each part of the bundle."
            info={{ what: "The forecast, backtest and macro files the export read, whether each was the final modelling output, and its SHA-256.", source: "meta.json (sources, source_sha256)" }}
          >
            <DataTable rows={sources} cols={scols} pageSize={12} csvName="modelling_inputs.csv" ariaLabel="Modelling inputs" />
          </Module>
          <Module
            className="g3-manifest"
            title={`${countWord(pipe.length, true)} upstream outputs are fingerprinted`}
            dek="Cleaning, anomaly and quality files from outputs/quality/manifest.json, hashed when the bundle was built."
            info={{ what: "The pipeline outputs upstream of the bundle with their SHA-256, so a rerun can be compared file by file.", source: "meta.json (pipeline_sha256)" }}
          >
            <DataTable rows={pipe} cols={pcols} pageSize={20} csvName="pipeline_hashes.csv" ariaLabel="Pipeline outputs" />
          </Module>
        </div>
      </div>

      <aside className="colophon" aria-label="Provenance">
        <span>
          <b>Rebuild</b> <code>python -m celeris export</code>
        </span>
        <span>
          <b>Verify by hand</b> <code>sha256sum dashboard/public/data/*.json</code>
        </span>
        <span>
          <b>Pipeline run</b> forecast <code>{facts.hash ?? "–"}</code>, celeris {meta.package_version}, bundle v{meta.bundle_version}
        </span>
      </aside>
    </>
  );
}

