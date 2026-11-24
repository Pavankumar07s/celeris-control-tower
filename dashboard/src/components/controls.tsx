// Controls: segmented (lenses and modes), range presets, tabs (content inside a module), chips, rule chips,
// status pills, buttons and links.  All are keyboard reachable and carry the 2px burnt-orange focus ring.
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { ArrowRight } from "./icons";

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  /** Optional count shown after a tab label (mono). */
  count?: ReactNode;
  disabled?: boolean;
}

/** Arrow-key navigation inside a radiogroup / tablist. */
function arrowNav<T extends string>(e: KeyboardEvent, options: Option<T>[], value: T, onChange: (v: T) => void) {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const live = options.filter((o) => !o.disabled);
  const i = live.findIndex((o) => o.value === value);
  const next = live[(i + (e.key === "ArrowRight" ? 1 : -1) + live.length) % live.length];
  if (next) {
    e.preventDefault();
    onChange(next.value);
    const host = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => (host.querySelector('[aria-checked="true"],[aria-selected="true"]') as HTMLElement | null)?.focus());
  }
}

/** Segmented control: sets a lens or a mode (Units | USD, Open | All).  Quiet grey track, raised segment. */
export function Segmented<T extends string>(props: { value: T; options: Option<T>[]; onChange: (v: T) => void; ariaLabel: string; size?: "sm" | "md" }) {
  return (
    <div className={`seg ${props.size === "sm" ? "sm" : ""}`} role="radiogroup" aria-label={props.ariaLabel} onKeyDown={(e) => arrowNav(e, props.options, props.value, props.onChange)}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={o.value === props.value ? 0 : -1}
          title={o.title}
          disabled={o.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Range presets on a timeline ("2019–2028 | Since 2024 | Forecast window"), instead of a zoom slider. */
export function RangePresets<T extends string>(props: { value: T; options: Option<T>[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="presets" role="radiogroup" aria-label={props.ariaLabel ?? "Time range"} onKeyDown={(e) => arrowNav(e, props.options, props.value, props.onChange)}>
      {props.options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === props.value} tabIndex={o.value === props.value ? 0 : -1} title={o.title} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Text tabs with a 2px ink underline on the selected one, on a hairline baseline. */
export function Tabs<T extends string>(props: { value: T; options: Option<T>[]; onChange: (v: T) => void; ariaLabel: string; className?: string }) {
  return (
    <div className={`tabs ${props.className ?? ""}`} role="tablist" aria-label={props.ariaLabel} onKeyDown={(e) => arrowNav(e, props.options, props.value, props.onChange)}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={o.value === props.value}
          tabIndex={o.value === props.value ? 0 : -1}
          title={o.title}
          disabled={o.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Rule / type chip (3px radius on --hover): exception rules, anomaly types. */
export const RuleChip = ({ children, title }: { children: ReactNode; title?: string }) => (
  <span className="rule-chip" title={title}>
    {children}
  </span>
);

export type PillTone = "neutral" | "warn" | "good" | "crit" | "forecast";
/** Status pill: fully round, a dot plus the word.  Status colour never appears without its label. */
export function StatusPill({ tone = "neutral", children, onClick, title, icon }: { tone?: PillTone; children: ReactNode; onClick?: () => void; title?: string; icon?: ReactNode }) {
  const inner = (
    <>
      {icon ?? <i aria-hidden="true" />}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className={`status-pill ${tone}`} onClick={onClick} title={title}>
      {inner}
    </button>
  ) : (
    <span className={`status-pill ${tone}`} title={title}>
      {inner}
    </span>
  );
}

/** Button: default (raised, ruled), primary (ink-filled), quiet (no border). */
export function Button({ variant = "default", size = "md", children, ...rest }: { variant?: "default" | "primary" | "quiet"; size?: "sm" | "md"; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn ${variant === "default" ? "" : variant} ${size === "sm" ? "sm" : ""}`} {...rest}>
      {children}
    </button>
  );
}

/** Square icon button (theme toggle, close). */
export function IconButton({ label, children, ...rest }: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/** An inline link inside prose that performs an action (applies a filter, opens a view). */
export const LinkButton = ({ onClick, children, title }: { onClick: () => void; children: ReactNode; title?: string }) => (
  <button type="button" className="linkish" onClick={onClick} title={title}>
    {children}
  </button>
);

/** Evidence link at the end of a figure or brief item: "Stock-outs & lost sales →". */
export const MoreLink = ({ onClick, href, children }: { onClick?: () => void; href?: string; children: ReactNode }) =>
  href ? (
    <a className="more-link" href={href}>
      {children} <ArrowRight size={11} />
    </a>
  ) : (
    <button type="button" className="more-link" onClick={onClick}>
      {children} <ArrowRight size={11} />
    </button>
  );
