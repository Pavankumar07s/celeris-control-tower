// Module: the unit of a view.  A 1px rule above, a computed conclusion title, a dek (what is plotted,
// units, scope), tools on the right (presets / toggles / table twin / "i"), an inline key, the evidence
// and a footnote.  No card, no shadow: structure comes from the rule and the spacing.
import type { ReactNode } from "react";
import { Info, type InfoProps } from "./overlays";

export type KeyKind = "line" | "thin" | "dash" | "dot" | "box" | "band" | "ring" | "point" | "diamond" | "triangle" | "rule";
export interface KeyItem {
  kind: KeyKind;
  label: ReactNode;
  /** CSS colour (prefer tokens: "var(--ink)", "var(--accent)", "var(--loss-fill)" ...). */
  color?: string;
  title?: string;
}

/** Inline key above a chart.  `"sep"` inserts the hairline between the past and the future groups. */
export function Key({ items, ariaLabel = "Key" }: { items: (KeyItem | "sep")[]; ariaLabel?: string }) {
  // groups split at "sep": the hairline travels with the group it opens, so a wrapped key never starts a line with it
  const groups: KeyItem[][] = [[]];
  for (const it of items) {
    if (it === "sep") groups.push([]);
    else groups[groups.length - 1].push(it);
  }
  return (
    <div className="key" role="list" aria-label={ariaLabel}>
      {groups.filter((g) => g.length).map((g, gi) => (
        <span key={gi} className="key-group" role="presentation">
          {g.map((it, i) => (
            <span key={i} role="listitem" title={it.title}>
              <KeyMark kind={it.kind} color={it.color} />
              {it.label}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

export function KeyMark({ kind, color = "var(--ink)" }: { kind: KeyKind; color?: string }) {
  const style =
    kind === "box" || kind === "point"
      ? { background: color }
      : kind === "triangle"
        ? { borderBottomColor: color }
        : kind === "band"
          ? undefined
          : { borderColor: color };
  return <i className={`km km-${kind}`} style={style} aria-hidden="true" />;
}

/** The standard key of the shared timeline (past group | future group). */
export function timelineKey(opts: { latent?: boolean; fc?: boolean; band?: boolean; lost?: boolean; rebuilt?: boolean; columns?: boolean; extra?: KeyItem[]; present?: { shipped: boolean; lost: boolean; rebuilt: boolean } }): (KeyItem | "sep")[] {
  const { latent = false, fc = true, band = true, columns = false, present } = opts;
  // a key lists only marks the chart draws in its visible range (markPresence in charts/timeline.ts)
  const lost = (opts.lost ?? true) && (present ? present.lost : true);
  const rebuilt = (opts.rebuilt ?? true) && (present ? present.rebuilt : true);
  const shippedLine = present ? present.shipped : true;
  const past: KeyItem[] = latent
    ? [{ kind: columns ? "box" : "line", color: "var(--ink)", label: "Latent monthly demand" }]
    : columns
      ? [{ kind: "box", color: "var(--ink)", label: "Shipped" }, ...(lost ? [{ kind: "box" as const, color: "var(--loss-fill)", label: "Lost to stock-outs" }] : [])]
      : [
          { kind: "line", color: "var(--ink)", label: "Unconstrained demand" },
          ...(shippedLine ? [{ kind: "thin" as const, color: "var(--ink-4)", label: "Shipped, where lower" }] : []),
          ...(lost ? [{ kind: "box" as const, color: "var(--loss-fill)", label: "Lost to stock-outs" }] : []),
          ...(rebuilt ? [{ kind: "ring" as const, color: "var(--ink)", label: "Months with rebuilt or unknown cells" }] : []),
        ];
  const future: KeyItem[] = fc
    ? [
        { kind: columns ? "box" : "line", color: "var(--accent)", label: latent ? "Latent demand, forecast" : "Forecast" },
        ...(band && !latent ? [{ kind: "band" as const, label: columns ? "P10–P90 whisker" : "P10–P90 range" }] : []),
      ]
    : [];
  return [...past, ...(future.length ? ["sep" as const, ...future] : []), ...(opts.extra ?? [])];
}

export interface ModuleProps {
  /** The conclusion title (a computed sentence; see insights/headlines.ts). */
  title: ReactNode;
  /** One line: what is plotted, units, scope. */
  dek?: ReactNode;
  /** Right-aligned tools, in order: presets / segmented, view toggles, table twin, then info. */
  tools?: ReactNode;
  /** The "i" popover content. */
  info?: InfoProps;
  /** Inline key items shown between the dek and the evidence. */
  keyItems?: (KeyItem | "sep")[];
  /** Footnote under the evidence (12px ink-3). */
  foot?: ReactNode;
  /** Heavy (ink) top rule: marks where the numbers start. */
  heavy?: boolean;
  id?: string;
  className?: string;
  /** Heading level of the title (default 2). */
  level?: 2 | 3;
  children?: ReactNode;
}

export function Module({ title, dek, tools, info, keyItems, foot, heavy, id, className, level = 2, children }: ModuleProps) {
  const H = level === 3 ? "h3" : "h2";
  const titleId = id ? `${id}-t` : undefined;
  return (
    <section className={`module ${heavy ? "heavy" : ""} ${className ?? ""}`} id={id} aria-labelledby={titleId}>
      <div className="mod-head">
        <div>
          <H className="mod-title" id={titleId}>
            {title}
          </H>
          {dek && <p className="mod-dek">{dek}</p>}
        </div>
        {(tools || info) && (
          <div className="mod-tools">
            {tools}
            {info && <Info {...info} />}
          </div>
        )}
      </div>
      {keyItems && keyItems.length > 0 && <Key items={keyItems} />}
      {children !== undefined && <div className={keyItems ? "" : "mod-body"}>{children}</div>}
      {foot && <div className="mod-foot">{foot}</div>}
    </section>
  );
}
