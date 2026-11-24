// React wrapper over a tree-shaken ECharts build (canvas renderer, only the chart types and components we use).
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, CustomChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption, ECharts } from "echarts/core";

echarts.use([
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type ChartEvent = { componentType?: string; seriesName?: string; seriesIndex?: number; dataIndex: number; name: string; value: unknown; data: unknown };

interface Props {
  option: EChartsCoreOption;
  height: number;
  onClick?: (e: ChartEvent) => void;
  /** Click anywhere in a grid: the category index of x-axis 0 under the pointer (grid `xGrid`, default 0). */
  onXClick?: (index: number) => void;
  xGrid?: number;
  ariaLabel: string;
  className?: string;
}

export function EChart({ option, height, onClick, onXClick, xGrid = 0, ariaLabel, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const xClickRef = useRef({ onXClick, xGrid });
  xClickRef.current = { onXClick, xGrid };

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const c = echarts.init(el, undefined, { renderer: "canvas" });
    chart.current = c;
    c.on("click", (e) => clickRef.current?.(e as unknown as ChartEvent));
    c.getZr().on("click", (e: { offsetX: number; offsetY: number }) => {
      const { onXClick: fn, xGrid: grid } = xClickRef.current;
      if (!fn || !c.containPixel({ gridIndex: grid }, [e.offsetX, e.offsetY])) return;
      const v = c.convertFromPixel({ xAxisIndex: 0 }, [e.offsetX, e.offsetY]) as unknown as number[] | number;
      const idx = Array.isArray(v) ? v[0] : v;
      if (Number.isFinite(idx)) fn(Math.round(idx));
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ height, width: "100%" }} role="img" aria-label={ariaLabel} />;
}
