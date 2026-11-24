// Compatibility barrel.  New code imports from the component files directly (Module, Figure, controls,
// tables, overlays, states); views that are not restyled yet keep importing Card, Kpi, Info, Segmented,
// DataTable, Drawer, TimelineLegend ... from here, re-skinned with the editorial tokens.
import type { ReactNode } from "react";
import { KeyMark } from "./Module";

export { Info, Drawer, Popover, ToastHost, toast, type InfoProps } from "./overlays";
export { Segmented, RangePresets, Tabs, RuleChip, StatusPill, Button, IconButton, LinkButton, MoreLink, type Option } from "./controls";
export { DataTable, BarTable, BarTrack, InlineBar, toCsv, download, type Column, type BarCol, type BarSpec } from "./tables";
export { Loading, Empty, ErrorState, Notice, Skeleton, SkeletonText, SkeletonChart } from "./states";
export { Module, Key, KeyMark, timelineKey, type KeyItem } from "./Module";
export { Lede, ViewHeader, Figure, HeroFigure, FigureStrip, RangeStrip, Ladder, Sparkline, Meter, Delta, Rich } from "./Figure";

/** @deprecated Use <Module>.  A card is now a module: rule above, title, dek, tools; no box. */
export function Card(props: { title: ReactNode; sub?: ReactNode; tools?: ReactNode; info?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${props.className ?? ""}`} id={props.id}>
      <div className="card-head">
        <div className="t">
          <h2>{props.title}</h2>
          {props.sub && <div className="sub">{props.sub}</div>}
        </div>
        {(props.tools || props.info) && (
          <div className="card-tools">
            {props.tools}
            {props.info}
          </div>
        )}
      </div>
      {props.children}
    </section>
  );
}

/** @deprecated Use <Figure> inside <FigureStrip>.  Renders as a figure in a `.kpis` strip. */
export function Kpi(props: { label: ReactNode; value: ReactNode; unit?: string; foot?: ReactNode; info?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="label">
        {props.label}
        {props.info}
      </div>
      <div className="value">
        {props.value}
        {props.unit && <small>{props.unit}</small>}
      </div>
      {props.foot && <div className="foot">{props.foot}</div>}
    </div>
  );
}

/** @deprecated Use <Key items={timelineKey({...})}/> (or <TimelineChart> with a Module keyItems). */
export function TimelineLegend({ latent, band = true, fc = true, extra }: { latent: boolean; band?: boolean; fc?: boolean; extra?: ReactNode }) {
  return (
    <div className="legend" aria-label="Timeline legend">
      <span>
        <KeyMark kind="line" color="var(--ink)" />
        {latent ? "Latent monthly demand" : "Unconstrained demand"}
      </span>
      {!latent && (
        <span>
          <KeyMark kind="thin" color="var(--ink-4)" />
          Shipped, where lower
        </span>
      )}
      {!latent && (
        <span>
          <KeyMark kind="box" color="var(--loss-fill)" />
          Lost to stock-outs
        </span>
      )}
      {fc && (
        <span>
          <KeyMark kind="line" color="var(--accent)" />
          {latent ? "Latent demand, forecast" : "Forecast"}
        </span>
      )}
      {fc && band && !latent && (
        <span>
          <KeyMark kind="band" />
          P10–P90 range
        </span>
      )}
      {extra}
    </div>
  );
}
