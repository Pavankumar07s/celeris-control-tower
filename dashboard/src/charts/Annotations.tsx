// The story layer: data-computed annotations drawn as an HTML/SVG overlay over an ECharts canvas,
// positioned with chart.convertToPixel.  Labels are measured, wrapped and placed in empty space (above the
// lines, or below them), never over a line, another label or the last-actual divider; at most five per
// chart; below 640px only the zone and end labels remain and the rest become a numbered list.
import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { fpx, fz } from "./theme";

export interface Annotation {
  id: string;
  /** Category index on x-axis 0, in the chart's own (possibly sliced) data. */
  at: number;
  /** Value of the anchor point on y-axis 0. */
  value: number;
  title: string;
  text?: string;
  /** above / below the lines; zone = label at the top of the plot beside the divider; end = right margin. */
  anchor: "above" | "below" | "zone" | "end";
  /** past = ink dot, future = orange dot (and the label stays inside the forecast window). */
  tone: "past" | "future";
  /** Preferred side of the leader for the label (left = label starts right of the leader). */
  align?: "left" | "right";
  /** Lower draws first and wins space; default = order in the list. */
  priority?: number;
  /** Draw the dot and leader (default true for above / below). */
  leader?: boolean;
}

export interface AnnotationFrame {
  /** Series values the labels must keep clear of, aligned with the x categories. */
  avoid: ArrayLike<number | null>[];
  /** Category index of the last actual (the divider), or -1. */
  divider: number;
  /** Columns: the divider sits on the band edge between `divider` and `divider + 1`. */
  dividerBetween?: boolean;
  /** Number of categories on the x axis. */
  n: number;
  yMin: number;
  yMax: number;
}

interface Placed {
  a: Annotation;
  x: number;
  y: number;
  w: number;
  h: number;
  titleLines: string[];
  textLines: string[];
  cls: string;
  leader?: { x: number; y1: number; y2: number };
  dot?: { x: number; y: number };
}

// Sizes follow the type scale (fz / fpx: 1 up to a 1600px viewport), the same factor as the CSS `--u` that
// sizes the .anno text, so measured boxes match the rendered labels on extra-large screens too.
const FAMILY = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
let TITLE_FONT = `600 12.5px ${FAMILY}`;
let TEXT_FONT = `400 12px ${FAMILY}`;
let ZONE_FONT = `600 11px ${FAMILY}`;
let TITLE_LH = 17;
let TEXT_LH = 16.5;
let MAX_W = 190;
function scaleFonts() {
  TITLE_FONT = `600 ${fz(12.5)}px ${FAMILY}`;
  TEXT_FONT = `400 ${fz(12)}px ${FAMILY}`;
  ZONE_FONT = `600 ${fz(11)}px ${FAMILY}`;
  TITLE_LH = fz(17);
  TEXT_LH = fz(16.5);
  MAX_W = fpx(190);
}
const MAX_STORY = 5;

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 6.5;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Greedy word wrap to `maxW` px; explicit "\n" forces a break. */
export function wrap(text: string, font: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, font) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

function box(title: string, text: string | undefined, maxW: number, zone = false) {
  const tf = zone ? ZONE_FONT : TITLE_FONT;
  const titleLines = title ? wrap(zone ? title.toUpperCase() : title, tf, maxW) : [];
  const textLines = text ? wrap(text, TEXT_FONT, maxW) : [];
  const w = Math.ceil(Math.max(1, ...titleLines.map((l) => measure(l, tf) * (zone ? 1.09 : 1)), ...textLines.map((l) => measure(l, TEXT_FONT)))) + 1;
  const h = titleLines.length * TITLE_LH + textLines.length * TEXT_LH;
  return { titleLines, textLines, w, h };
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad = 6) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export interface LayoutResult {
  placed: Placed[];
  listed: Annotation[];
  /** Where each listed annotation sits on the plot, so the numbered list under the chart has its numbers on the data. */
  marks?: { n: number; x: number; y: number }[];
}

/** Place annotations on a rendered chart.  Pure apart from convertToPixel / text measurement. */
export function layoutAnnotations(chart: ECharts, items: Annotation[], f: AnnotationFrame): LayoutResult {
  scaleFonts();
  const W = chart.getWidth();
  const px = (i: number, v: number): [number, number] => {
    const p = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [i, v]) as unknown as number[];
    return [p[0], p[1]];
  };
  const [x0, yBot] = px(0, f.yMin);
  const [x1, yTop] = px(Math.max(0, f.n - 1), f.yMax);
  if (!Number.isFinite(x0) || !Number.isFinite(yTop)) return { placed: [], listed: [] };
  const step = f.n > 1 ? (x1 - x0) / (f.n - 1) : 1;
  const xd = f.divider >= 0 && f.divider < f.n ? (f.dividerBetween && f.divider < f.n - 1 ? (px(f.divider, f.yMin)[0] + px(f.divider + 1, f.yMin)[0]) / 2 : px(f.divider, f.yMin)[0]) : null;
  const narrow = W < 640;

  // the vertical band [top, bottom] in pixels that the avoided lines occupy over a horizontal span
  const band = (xa: number, xb: number) => {
    const ia = Math.max(0, Math.floor((xa - x0) / step) - 1);
    const ib = Math.min(f.n - 1, Math.ceil((xb - x0) / step) + 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of f.avoid) {
      for (let i = ia; i <= ib; i++) {
        const v = s[i];
        if (v === null || v === undefined || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (lo === Infinity) return null;
    return { top: px(ia, hi)[1], bottom: px(ia, lo)[1] };
  };

  const placed: Placed[] = [];
  const listed: Annotation[] = [];
  const free = (r: { x: number; y: number; w: number; h: number }) => placed.every((p) => !overlaps(r, p));
  const sorted = items.map((a, k) => ({ a, k })).sort((p, q) => (p.a.priority ?? p.k) - (q.a.priority ?? q.k));

  // 1) fixed labels: zone pair and end label
  for (const { a } of sorted) {
    if (a.anchor === "zone") {
      if (xd === null) continue;
      const left = a.align !== "right";
      const maxW = left ? Math.max(60, x1 - xd - 12) : Math.min(MAX_W, xd - x0 - 12);
      const b = box(a.title, a.text, maxW, left && a.tone === "future");
      const x = left ? xd + 8 : xd - 8 - b.w;
      placed.push({ a, x, y: 4, ...b, cls: `zone-pair ${left && a.tone === "future" ? "zone" : "right"}` });
    } else if (a.anchor === "end") {
      const [ex, ey] = px(a.at, a.value);
      const b = box(a.title, a.text, Math.max(40, W - ex - 12));
      let x = ex + 10;
      let y = Math.max(yTop - 22, Math.min(ey - 20, yBot - b.h));
      if (x + b.w > W - 2) {
        // too narrow for the right margin: pull the label inside and lift it above the lines it would cover
        x = Math.max(0, W - 2 - b.w);
        const bnd = band(x, W - 2);
        y = Math.max(yTop - 22, (bnd ? Math.min(bnd.top, ey) : ey) - b.h - 8);
      }
      placed.push({ a, x, y, ...b, cls: "end" });
    }
  }

  // 2) story labels: shortest feasible leader, clean of lines, labels and the divider
  let story = 0;
  for (const { a } of sorted) {
    if (a.anchor === "zone" || a.anchor === "end") continue;
    if (a.at < 0 || a.at >= f.n) continue;
    if (narrow || story >= MAX_STORY) {
      listed.push(a);
      continue;
    }
    const [x, y] = px(a.at, a.value);
    let maxW = MAX_W;
    if (a.tone === "future" && xd !== null) maxW = Math.min(MAX_W, Math.max(80, x1 - xd - 14));
    const b = box(a.title, a.text, maxW);
    const anchors: ("above" | "below")[] = a.anchor === "below" ? ["below", "above"] : ["above", "below"];
    // future labels start at the divider (left-aligned, capped at the window width); past labels sit
    // beside their leader, on the preferred side first
    const aligns: ("left" | "right" | "divider")[] =
      a.tone === "future" && xd !== null ? ["divider", "left", "right"] : a.align === "right" ? ["right", "left"] : ["left", "right"];
    let best: Placed | null = null;
    let bestCost = Infinity;
    for (const an of anchors) {
      for (const al of aligns) {
        let bx = al === "divider" ? (xd as number) + 8 : al === "left" ? x + 6 : x - 6 - b.w;
        // keep inside the plot and on the correct side of the divider
        if (a.tone === "future" && xd !== null) bx = Math.max(bx, xd + 8);
        if (a.tone === "past" && xd !== null && bx + b.w > xd - 8) continue;
        if (bx < x0 - 30 || bx + b.w > (xd !== null && a.tone === "past" ? xd - 8 : x1 + 4)) continue;
        if (al !== "divider" && Math.abs((al === "left" ? bx : bx + b.w) - x) > 120) continue;
        const bnd = band(bx, bx + b.w) ?? { top: y, bottom: y };
        let by: number;
        if (an === "above") {
          by = Math.min(bnd.top, y) - 14 - b.h;
          if (by < yTop - 6) continue;
        } else {
          by = Math.max(bnd.bottom, y) + 14;
          if (by + b.h > yBot - 4) continue;
        }
        const r = { x: bx, y: by, w: b.w, h: b.h };
        if (!free(r)) continue;
        const cost = Math.abs((an === "above" ? by + b.h : by) - y) + (an === a.anchor ? 0 : 40) + (al === aligns[0] ? 0 : 12);
        if (cost < bestCost) {
          bestCost = cost;
          // a leader that would run into its own label stops at the label's edge; otherwise it runs
          // alongside the label to the level of its nearest text line
          const across = x >= bx - 3 && x <= bx + b.w + 3;
          const leaderEnd = an === "above" ? (across ? by + b.h + 3 : by + b.h - 6) : across ? by - 3 : by + 8;
          best = {
            a,
            ...r,
            ...b,
            cls: `${al === "right" ? "right" : ""} ${a.tone}`,
            leader: a.leader === false ? undefined : { x, y1: an === "above" ? y - 5 : y + 5, y2: leaderEnd },
            dot: a.leader === false ? undefined : { x, y },
          };
        }
      }
    }
    if (best) {
      placed.push(best);
      story++;
    } else listed.push(a);
  }
  const marks = listed.map((a, k) => {
    const [x, y] = px(a.at, a.value);
    return { n: k + 1, x, y };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return { placed, listed, marks };
}

/** Overlay that re-lays itself whenever the chart reports a new layout (`version`) or fonts finish loading. */
export function AnnotationLayer({ chart, items, frame, version, onListed }: { chart: ECharts | null; items: Annotation[]; frame: AnnotationFrame | null; version: number; onListed?: (a: Annotation[]) => void }) {
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => alive && setFontsReady((v) => v + 1));
    return () => {
      alive = false;
    };
  }, []);
  const res = useMemo(() => (chart && frame && !chart.isDisposed() ? layoutAnnotations(chart, items, frame) : { placed: [], listed: [] }), [chart, items, frame, version, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onListed?.(res.listed), [res, onListed]);
  if (!res.placed.length && !res.marks?.length) return null;
  return (
    <div className="annos" aria-hidden="true">
      {res.marks?.map((p) => (
        <span key={`n-${p.n}`} className="anno-num" style={{ left: Math.round(p.x), top: Math.round(p.y) }}>
          {p.n}
        </span>
      ))}
      <svg>
        {res.placed.map((p) =>
          p.leader ? <line key={`l-${p.a.id}`} x1={p.leader.x} x2={p.leader.x} y1={p.leader.y1} y2={p.leader.y2} stroke="var(--ink-3)" strokeWidth={1} shapeRendering="crispEdges" /> : null,
        )}
        {res.placed.map((p) =>
          p.dot ? <circle key={`d-${p.a.id}`} cx={p.dot.x} cy={p.dot.y} r={3.5} fill={p.a.tone === "future" ? "var(--accent)" : "var(--ink)"} stroke="var(--paper)" strokeWidth={2} /> : null,
        )}
      </svg>
      {res.placed.map((p) => (
        <div key={p.a.id} className={`anno ${p.cls}`} style={{ left: Math.round(p.x), top: Math.round(p.y), width: p.w + 2 }}>
          {p.titleLines.map((l, i) => (
            <b key={`t${i}`}>{l}</b>
          ))}
          {p.textLines.map((l, i) => (
            <span key={`x${i}`} style={{ display: "block" }}>
              {l}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
