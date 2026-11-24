// The lede (computed serif headline + standfirst + the one hero figure) and the figure contract that
// replaces KPI tiles: label, value with a thin unit, ONE inline visual chosen by job (sparkline for trend,
// ladder for accuracy, meter for progress, range strip for uncertainty), one line of context, an evidence
// link.  Hero and figure values use proportional numerals and a sans face, never serif.
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Info, type InfoProps } from "./overlays";
import { MoreLink } from "./controls";

/** Render a template string with **bold** markers as text + <b> (no HTML injection possible). */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export interface LedeProps {
  /** Computed headline (insights/headlines.ts); at most two lines at 1440px. */
  headline: string;
  /** Computed standfirst; **bold** marks the key numbers. */
  standfirst?: string | ReactNode;
  /** Optional sentence-case kicker above the headline (never uppercase). */
  eyebrow?: ReactNode;
  /** The one hero figure (a <HeroFigure/>). */
  figure?: ReactNode;
}

/** View header: headline and standfirst on 8 columns, the hero figure on 4, split by a vertical hairline. */
export function Lede({ headline, standfirst, eyebrow, figure }: LedeProps) {
  return (
    <section className={`lede ${figure ? "" : "no-fig"}`} aria-label="Summary">
      <div className="lede-text" aria-live="polite">
        {eyebrow && <span className="kicker">{eyebrow}</span>}
        <h1 className={`headline ${headline.length > 46 ? "long" : ""}`}>{headline}</h1>
        {standfirst && <p className="standfirst">{typeof standfirst === "string" ? <Rich text={standfirst} /> : standfirst}</p>}
      </div>
      {figure}
    </section>
  );
}
/** Alias: the spec calls it the view header. */
export const ViewHeader = Lede;

export interface RangeStripProps {
  p10: number;
  p90: number;
  /** The tick in cobalt (the submitted total or the P50). */
  mid: number;
  /** The reference tick in ink (e.g. the last 19 months of demand). */
  reference?: number;
  refLabel?: string;
  format: (v: number) => string;
  /** Left label prefix (default "P10–P90"). */
  bandLabel?: string;
}

/** Range strip (signature): track, P10-P90 band with edge hairlines, cobalt tick, ink reference tick.
 *  Labels are anchored to the two ends of the track so they never collide. */
export function RangeStrip({ p10, p90, mid, reference: ref, refLabel = "Reference", format, bandLabel = "P10–P90" }: RangeStripProps) {
  const vals = [p10, p90, mid, ...(ref !== undefined ? [ref] : [])].filter(Number.isFinite);
  const a = Math.min(...vals);
  const z = Math.max(...vals);
  const pad = (z - a) * 0.12 || Math.abs(z) * 0.05 || 1;
  const lo = a - pad;
  const hi = z + pad;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const w = (v1: number, v2: number) => `${((v2 - v1) / (hi - lo)) * 100}%`;
  // each label sits at the end of the track nearest its mark, so labels never collide or mislead
  const bandRight = ref !== undefined && (p10 + p90) / 2 > ref;
  return (
    <div className="range" role="img" aria-label={`${bandLabel} ${format(p10)} to ${format(p90)}${ref !== undefined ? `; ${refLabel} ${format(ref)}` : ""}`}>
      <div className="track" />
      <div className="band" style={{ left: x(p10), width: w(p10, p90) }} />
      <div className="p50" style={{ left: x(mid) }} />
      {ref !== undefined && <div className="ref" style={{ left: x(ref) }} />}
      <span className={`lab ${bandRight ? "r" : "l"}`}>
        {bandLabel} <b>{format(p10)}–{format(p90)}</b>
      </span>
      {ref !== undefined && (
        <span className={`lab ${bandRight ? "l" : "r"}`}>
          {refLabel} <b>{format(ref)}</b>
        </span>
      )}
    </div>
  );
}

export interface FigureProps {
  label: ReactNode;
  value: ReactNode;
  /** Thin unit after the value ("units", "cells"). */
  unit?: ReactNode;
  /** ONE inline visual: <Sparkline/>, <Ladder/>, <Meter/> or <RangeStrip/>. */
  visual?: ReactNode;
  /** One line of context in plain words; **bold** allowed when a string. */
  context?: string | ReactNode;
  /** Evidence link at the bottom. */
  link?: { label: string; onClick?: () => void; href?: string };
  info?: InfoProps;
  /** Hero size (54px): one per view, in the lede. */
  hero?: boolean;
  className?: string;
}

export function Figure({ label, value, unit, visual, context, link, info, hero, className }: FigureProps) {
  return (
    <div className={`fig ${hero ? "hero" : ""} ${className ?? ""}`}>
      <span className="label">
        {label}
        {info && <Info {...info} size="sm" />}
      </span>
      <span className="value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {visual}
      {context && <span className="ctx">{typeof context === "string" ? <Rich text={context} /> : context}</span>}
      {link && (
        <span className="more">
          <MoreLink onClick={link.onClick} href={link.href}>
            {link.label}
          </MoreLink>
        </span>
      )}
    </div>
  );
}
/** The hero figure in the lede (54px value). */
export const HeroFigure = (p: Omit<FigureProps, "hero">) => <Figure {...p} hero />;

/** A row of 2-5 supporting figures: 1px top rule (ink when `heavy`), hairline dividers, no cards. */
export function FigureStrip({ children, heavy, columns, ariaLabel = "Headline figures" }: { children: ReactNode; heavy?: boolean; columns?: number; ariaLabel?: string }) {
  return (
    <section className={`figures ${heavy ? "heavy" : ""}`} aria-label={ariaLabel} style={columns ? ({ "--fig-cols": columns } as CSSProperties) : undefined}>
      {children}
    </section>
  );
}

/** "▼ 3.2%" in ink: demand down is neither good nor bad, so a delta takes no status colour. */
export function Delta({ value, digits = 1, suffix }: { value: number; digits?: number; suffix?: ReactNode }) {
  const arrow = value > 0.0005 ? "▲" : value < -0.0005 ? "▼" : "●";
  return (
    <>
      <span className="delta">
        <span aria-hidden="true">{arrow}</span> {Math.abs(value * 100).toFixed(digits)}%
      </span>
      {suffix && <> {suffix}</>}
    </>
  );
}

export interface LadderRow {
  label: string;
  value: number;
  /** Our model: cobalt bar, bold label. */
  me?: boolean;
}
/** Benchmark ladder (accuracy): naive -> seasonal naive -> our model, lower is better. */
export function Ladder({ rows, max, format, foot }: { rows: LadderRow[]; max?: number; format: (v: number) => string; foot?: ReactNode }) {
  const top = max ?? Math.max(...rows.map((r) => r.value)) * 1.05;
  return (
    <div className="ladder">
      {rows.map((r) => (
        <Fragment key={r.label}>
          <span className={r.me ? "me-l" : ""}>{r.label}</span>
          <span>
            <div className={`bar ${r.me ? "me" : ""}`} style={{ width: `${(r.value / top) * 100}%` }} />
          </span>
          <span className="v">{format(r.value)}</span>
        </Fragment>
      ))}
      {foot && <span className="foot">{foot}</span>}
    </div>
  );
}

export interface SparklineProps {
  /** History values (ink), index-aligned with the full month axis. */
  history: ArrayLike<number | null>;
  /** Forecast values (cobalt), same axis; should repeat the last actual as its first point. */
  forecast?: ArrayLike<number | null>;
  /** Index of the last actual (the window wash starts here). */
  divider?: number;
  height?: number;
  ariaLabel: string;
  /** y floor as a share of the minimum (default 0.85, so the trend is legible). */
  floor?: number;
}

/** Inline SVG sparkline: history in ink, forecast in cobalt, the forecast window washed. */
export function Sparkline({ history, forecast, divider, height = 34, ariaLabel, floor = 0.85 }: SparklineProps) {
  const n = Math.max(history.length, forecast?.length ?? 0);
  const vals: number[] = [];
  for (const a of [history, forecast]) if (a) for (let i = 0; i < a.length; i++) if (a[i] !== null && Number.isFinite(a[i] as number)) vals.push(a[i] as number);
  if (!vals.length || n < 2) return null;
  const lo = Math.min(...vals) * floor;
  const hi = Math.max(...vals);
  const W = 300;
  const H = height;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4);
  const path = (a: ArrayLike<number | null>) => {
    let d = "";
    let pen = false;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel} style={{ height }}>
      {divider !== undefined && <rect x={x(divider)} y={0} width={W - x(divider)} height={H} fill="var(--accent-wash)" />}
      <path d={path(history)} fill="none" stroke="var(--ink)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {forecast && <path d={path(forecast)} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  );
}

/** Progress meter: segments with a tone (good / warn / ink / accent / rest), widths proportional to value. */
export function Meter({ segments, ariaLabel }: { segments: { value: number; tone: "good" | "warn" | "ink" | "accent" | "rest"; label?: string }[]; ariaLabel: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="meter" role="img" aria-label={ariaLabel}>
      {segments.map((s, i) => (s.value > 0 ? <i key={i} className={s.tone} style={{ width: `${(s.value / total) * 100}%` }} title={s.label} /> : null))}
    </div>
  );
}
