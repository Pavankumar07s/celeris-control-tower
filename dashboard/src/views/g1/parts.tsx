// View-local building blocks for Data health, Demand explorer, Anomaly monitor and Stock-outs: the before ->
// after dumbbell, the part-of-whole split bar and the confidence meter.  Tokens and shared components only;
// nothing here is a number source (values come from the caller, computed from the bundle).
import { KeyMark } from "../../components/Module";

// ---- before -> after dumbbell (hero of Data health) --------------------------------------------------
/** A 0..max track with a hollow dot at `before`, a solid ink dot at `after` and the connector between
 *  them.  Both labels sit at the track ends (lower value left, higher value right), so they never collide. */
export function Dumbbell({ before, after, max, beforeLabel, afterLabel, format, ariaLabel }: { before: number; after: number; max: number; beforeLabel: string; afterLabel: string; format: (v: number) => string; ariaLabel: string }) {
  const x = (v: number) => `${(Math.max(0, Math.min(max, v)) / (max || 1)) * 100}%`;
  const lo = Math.min(before, after);
  const hi = Math.max(before, after);
  const beforeLeft = before <= after;
  return (
    <div className="g1-db" role="img" aria-label={ariaLabel}>
      <div className="track" />
      <div className="span" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <i className="dot before" style={{ left: x(before) }} />
      <i className="dot after" style={{ left: x(after) }} />
      <span className={`lab ${beforeLeft ? "l" : "r"}`}>
        {beforeLabel} <b>{format(before)}</b>
      </span>
      <span className={`lab ${beforeLeft ? "r" : "l"}`}>
        {afterLabel} <b>{format(after)}</b>
      </span>
    </div>
  );
}

// ---- split bar: the parts of one whole, each labelled once -------------------------------------------
export interface SplitPart {
  value: number;
  /** CSS colour (tokens only: "var(--ink)", "var(--loss)", "var(--cat-7)" ...). */
  color: string;
  label: string;
  /** Mark in the legend: a box (default), a hollow diamond or a filled triangle (anomaly classes). */
  mark?: "box" | "diamond" | "triangle";
  /** Formatted value printed in the legend. */
  text?: string;
}
/** A horizontal part-of-whole bar (2px surface gap between parts) with a legend that names every part
 *  and prints its value: colour is never the only cue. */
export function SplitBar({ parts, ariaLabel, legend = true }: { parts: SplitPart[]; ariaLabel: string; legend?: boolean }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="g1-split">
      <div className="bar" role="img" aria-label={ariaLabel}>
        {parts.map((p, i) => (p.value > 0 ? <i key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.text ?? p.value}`} /> : null))}
      </div>
      {legend && (
        <div className="leg">
          {parts.map((p, i) => (
            <span key={i}>
              <KeyMark kind={p.mark ?? "box"} color={p.color} />
              {p.label} {p.text && <b>{p.text}</b>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- confidence meter (register) -----------------------------------------------------------------------
const CONF_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3 };
/** Three-step 4px meter in warm grey plus the word (the word carries the meaning; the meter scans). */
export function ConfMeter({ level }: { level: string | null }) {
  const n = level ? (CONF_LEVEL[level] ?? 0) : 0;
  return (
    <span className="g1-conf" title={level ? `${level} confidence` : "no confidence recorded"}>
      <span className="steps" aria-hidden="true">
        {[1, 2, 3].map((k) => (
          <i key={k} className={k <= n ? "on" : ""} />
        ))}
      </span>
      {level ?? "–"}
    </span>
  );
}

