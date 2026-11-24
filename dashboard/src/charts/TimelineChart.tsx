// <TimelineChart>: the shared history-into-forecast timeline as one React component: builds the option
// (charts/timeline.ts), draws the annotation overlay on top, switches to the narrow layout below 640px
// (annotations collapse into a numbered list) and renders the footnote from the built model.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ECharts } from "echarts/core";
import { AnnotationLayer, type Annotation } from "./Annotations";
import { EChart } from "./EChart";
import { buildTimeline, type TimelineModel, type TimelineSpec } from "./timeline";

export interface TimelineChartProps {
  spec: Omit<TimelineSpec, "narrow" | "height">;
  /** Annotation generator: receives the built model (use timelineAnnotations, or your own). */
  annotate?: (model: TimelineModel) => Annotation[];
  height?: number;
  ariaLabel: string;
  busy?: boolean;
  onXClick?: (absoluteMonth: number) => void;
  /** Footnote under the chart, computed from the model (e.g. the P50 rule). */
  footnote?: (model: TimelineModel) => ReactNode;
}

export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function TimelineChart({ spec, annotate, height = 360, ariaLabel, busy, onXClick, footnote }: TimelineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 640;
  const model = useMemo(() => buildTimeline({ ...spec, narrow, height }), [spec, narrow, height]);
  const items = useMemo(() => (annotate ? annotate(model) : []), [annotate, model]);
  const [chart, setChart] = useState<ECharts | null>(null);
  const [version, setVersion] = useState(0);
  const [listed, setListed] = useState<Annotation[]>([]);
  const onLayout = useCallback((c: ECharts) => {
    setChart(c);
    setVersion((v) => v + 1);
  }, []);
  const onListed = useCallback((a: Annotation[]) => setListed((prev) => (prev.length === a.length && prev.every((p, i) => p.id === a[i].id) ? prev : a)), []);
  return (
    <div ref={ref} style={{ minWidth: 0 }}>
      <EChart option={model.option} height={height} ariaLabel={ariaLabel} busy={busy} onLayout={onLayout} onXClick={onXClick ? (i) => onXClick(model.start + i) : undefined}>
        <AnnotationLayer chart={chart} items={items} frame={model.frame} version={version} onListed={onListed} />
      </EChart>
      {listed.length > 0 && (
        <ol className="anno-list">
          {listed.map((a) => (
            <li key={a.id}>
              <b>{a.title}.</b> {a.text}
            </li>
          ))}
        </ol>
      )}
      {footnote && <div className="mod-foot">{footnote(model)}</div>}
    </div>
  );
}
