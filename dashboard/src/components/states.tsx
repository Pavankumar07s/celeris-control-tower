// Loading, empty and error states.  Loading keeps the frame (placeholders at real line heights, charts as
// empty axes; never a spinner over a chart).  Empty and error say what happened and what to do.
import type { CSSProperties, ReactNode } from "react";
import { WarnTriangle } from "./icons";

/** A placeholder block in --hover. */
export const Skeleton = ({ width = "100%", height = 14, style }: { width?: number | string; height?: number; style?: CSSProperties }) => (
  <span className="skel" style={{ width, height, ...style }} aria-hidden="true" />
);

/** Placeholder lines at a real line height (e.g. a headline: lines 2, height 34). */
export function SkeletonText({ lines = 3, height = 14, lastWidth = "60%" }: { lines?: number; height?: number; lastWidth?: string }) {
  return (
    <span className="skel-text" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={height} width={i === lines - 1 ? lastWidth : "100%"} />
      ))}
    </span>
  );
}

/** An empty chart frame (gridlines and baseline) for the first load of a chart. */
export const SkeletonChart = ({ height = 300 }: { height?: number }) => <div className="skel-chart" style={{ height }} aria-hidden="true" />;

/** Loading state that keeps the frame: a chart-sized placeholder plus a polite live message. */
export function Loading({ what, height = 220 }: { what: string; height?: number }) {
  return (
    <div aria-live="polite" aria-busy="true">
      <SkeletonChart height={height} />
      <span className="visually-hidden">Loading {what}…</span>
      <p className="caption" style={{ marginTop: 6 }}>
        Loading {what}…
      </p>
    </div>
  );
}

/** Empty state: what happened, and what to do. */
export function Empty({ title, children, action }: { title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      {title && <b>{title}</b>}
      {children && <span>{children}</span>}
      {action}
    </div>
  );
}

/** Error state naming the cause and the fix (default fix: re-run the export). */
export function ErrorState({ message, fix }: { message: string; fix?: ReactNode }) {
  return (
    <div className="state err" role="alert">
      <b>Could not load the data: {message}.</b>
      <span>
        {fix ?? (
          <>
            Run <code>python -m celeris export</code> to rewrite <code>dashboard/public/data</code>, then reload.
          </>
        )}
      </span>
    </div>
  );
}

/** Inline notice inside a module (rare): never a full-width page banner. */
export function Notice({ tone = "warn", children }: { tone?: "warn" | "crit" | "good" | "info"; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === "crit" ? "alert" : "status"}>
      {tone === "warn" && <WarnTriangle size={12} />}
      <span>{children}</span>
    </div>
  );
}
