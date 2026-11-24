// React wrapper over a tree-shaken ECharts build (canvas renderer, only the chart types and components we use).
//  - holds the previous render at 60 % opacity while `busy` (no skeleton flash on refetch);
//  - `onLayout(chart)` fires after every setOption and resize: annotation overlays re-place themselves;
//  - children render in an absolutely positioned layer over the canvas (the HTML annotation overlay);
//  - keyboard: with focus, Left / Right move the axis crosshair month by month (Esc hides it).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { chartHeight } from "./theme";

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

export type { ECharts };
export type ChartEvent = { componentType?: string; seriesName?: string; seriesIndex?: number; dataIndex: number; name: string; value: unknown; data: unknown };

interface Props {
  option: EChartsCoreOption;
  /** Design height at 1440px.  On screens wider than 1600px the chart grows (see `chartHeight`): with
   *  `aspect` it keeps about that width:height ratio, otherwise it grows with the viewport.  `fixedHeight`
   *  turns growth off (the caller already sized it, e.g. TimelineChart). */
  height: number;
  aspect?: number;
  fixedHeight?: boolean;
  onClick?: (e: ChartEvent) => void;
  /** Click anywhere in a grid: the category index of x-axis 0 under the pointer (grid `xGrid`, default 0). */
  onXClick?: (index: number) => void;
  xGrid?: number;
  ariaLabel: string;
  className?: string;
  /** Dim the current render to 60 % while new data is on its way. */
  busy?: boolean;
  /** Called with the instance after each setOption and resize (for overlays using convertToPixel). */
  onLayout?: (chart: ECharts) => void;
  /** Overlay content (e.g. <AnnotationLayer/>), positioned over the canvas. */
  children?: ReactNode;
}

export function EChart({ option, height, aspect, fixedHeight, onClick, onXClick, xGrid = 0, ariaLabel, className, busy, onLayout, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const h = fixedHeight ? height : chartHeight(height, width, aspect);
  const chart = useRef<ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const xClickRef = useRef({ onXClick, xGrid });
  xClickRef.current = { onXClick, xGrid };
  const layoutRef = useRef(onLayout);
  layoutRef.current = onLayout;
  const tip = useRef(-1);
  const ariaRef = useRef(ariaLabel);
  ariaRef.current = ariaLabel;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const c = echarts.init(el, undefined, { renderer: "canvas" });
    chart.current = c;
    c.on("click", (e) => clickRef.current?.(e as unknown as ChartEvent));
    c.getZr().on("click", (e: { offsetX: number; offsetY: number }) => {
      const { onXClick: fn, xGrid: want } = xClickRef.current;
      if (!fn) return;
      // the shared timeline now has a single grid: fall back to grid 0 when the requested one does not exist
      const grids = ((c.getOption() as { grid?: unknown[] }).grid ?? []).length || 1;
      const grid = want < grids ? want : 0;
      if (!c.containPixel({ gridIndex: grid }, [e.offsetX, e.offsetY])) return;
      const v = c.convertFromPixel({ xAxisIndex: 0 }, [e.offsetX, e.offsetY]) as unknown as number[] | number;
      const idx = Array.isArray(v) ? v[0] : v;
      if (Number.isFinite(idx)) fn(Math.round(idx));
    });
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setWidth(el.clientWidth);
        c.resize();
        layoutRef.current?.(c);
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    // every chart carries an accessible description (ECharts aria) stating what it shows
    const o = option as { aria?: { enabled?: boolean; label?: Record<string, unknown> } };
    c.setOption({ ...option, aria: { ...(o.aria ?? {}), enabled: true, decal: { show: false }, label: { ...(o.aria?.label ?? {}), description: ariaRef.current } } }, { notMerge: true, lazyUpdate: false });
    tip.current = -1;
    layoutRef.current?.(c);
  }, [option]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const c = chart.current;
    if (!c) return;
    if (e.key === "Escape") {
      c.dispatchAction({ type: "hideTip" });
      tip.current = -1;
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const opt = c.getOption() as { xAxis?: { data?: unknown[] }[] };
    const n = opt.xAxis?.[0]?.data?.length ?? 0;
    if (!n) return;
    e.preventDefault();
    const cur = tip.current < 0 ? n - 1 : tip.current;
    tip.current = Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
    c.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: tip.current });
  };

  return (
    <div className={`chartbox ${className ?? ""}`} style={{ height: h }}>
      <div ref={ref} className={`chart-canvas ${busy ? "busy" : ""}`} style={{ position: "absolute", inset: 0 }} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} />
      {children}
    </div>
  );
}
