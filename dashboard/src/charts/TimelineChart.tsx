// <TimelineChart>: the shared history-into-forecast timeline as one React component: builds the option
// (charts/timeline.ts), draws the annotation overlay on top, switches to the narrow layout below 640px
// (annotations collapse into a numbered list) and renders the footnote from the built model.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ECharts, EChartsCoreOption } from "echarts/core";
import { useElementWidth } from "../app/hooks";
import { AnnotationLayer, type Annotation } from "./Annotations";
import { EChart } from "./EChart";
import { chartHeight } from "./theme";
import { buildTimeline, type TimelineModel, type TimelineSpec } from "./timeline";

/** The shared timeline keeps about the 3.1:1 shape it has at 1440px (1128 x 360) on wider screens. */
const TIMELINE_ASPECT = 3.1;

export interface TimelineChartProps {
  spec: Omit<TimelineSpec, "narrow" | "height">;
  /** Annotation generator: receives the built model (use timelineAnnotations, or your own). */
  annotate?: (model: TimelineModel) => Annotation[];
  /** Design height at 1440px; on screens wider than 1600px it grows to keep the timeline's shape (chartHeight). */
  height?: number;
  ariaLabel: string;
  busy?: boolean;
  onXClick?: (absoluteMonth: number) => void;
  /** Footnote under the chart, computed from the model (e.g. the P50 rule). */
  footnote?: (model: TimelineModel) => ReactNode;
  /** Adjust the built option (a view-specific layer such as an evidence area); keep it memoised. */
  patch?: (option: EChartsCoreOption, model: TimelineModel) => EChartsCoreOption;
}

export function TimelineChart({ spec, annotate, height: base = 360, ariaLabel, busy, onXClick, footnote, patch }: TimelineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 640;
  const height = chartHeight(base, width, TIMELINE_ASPECT);
  const model = useMemo(() => buildTimeline({ ...spec, narrow, height }), [spec, narrow, height]);
  const option = useMemo(() => (patch ? patch(model.option, model) : model.option), [model, patch]);
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
      <EChart option={option} height={height} fixedHeight ariaLabel={ariaLabel} busy={busy} onLayout={onLayout} onXClick={onXClick ? (i) => onXClick(model.start + i) : undefined}>
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
