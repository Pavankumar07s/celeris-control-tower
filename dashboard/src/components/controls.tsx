// Controls: segmented (lenses and modes), range presets, tabs (content inside a module), chips, rule chips,
// status pills, buttons and links.  All are keyboard reachable and carry the 2px burnt-orange focus ring.
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { ArrowRight, CheckCircle, CrossCircle, MinusIcon, PlusIcon, WarnTriangle } from "./icons";

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

/** A native select with a visible sentence-case label: stacked (label above) or `inline` (label left). */
export function Select<T extends string | number>({ label, value, options, onChange, id, inline }: { label: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id?: string; inline?: boolean }) {
  return (
    <label className={`field${inline ? " inline" : ""}`} htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        className="select"
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Numeric stepper (− value +): keyboard reachable, the value announced politely, 44px targets on phones. */
export function Stepper({ value, min, max, onChange, label, format }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; format: (v: number) => ReactNode }) {
  const what = label.toLowerCase();
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Shorter ${what}`} title={`Shorter ${what}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <MinusIcon />
      </button>
      <output aria-live="polite">{format(value)}</output>
      <button type="button" aria-label={`Longer ${what}`} title={`Longer ${what}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <PlusIcon />
      </button>
    </span>
  );
}

/** A rule check with its word: a green tick or a red cross, never colour alone (wrap several in `.stamps`). */
export function Stamp({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`stamp ${ok ? "good" : "crit"}`}>
      {ok ? <CheckCircle size={13} /> : <CrossCircle size={13} />}
      <span className="visually-hidden">{ok ? "Passes:" : "Fails:"}</span>
      <span>{children}</span>
    </span>
  );
}

/** A data-quality check's state as a pill: Pass / Fail / Warning / Note, each with its icon. */
export function CheckPill({ passed, severity }: { passed: boolean; severity: "error" | "warning" | "info" }) {
  if (passed)
    return (
      <StatusPill tone="good" icon={<CheckCircle size={11} />}>
        Pass
      </StatusPill>
    );
  if (severity === "error")
    return (
      <StatusPill tone="crit" icon={<CrossCircle size={11} />}>
        Fail
      </StatusPill>
    );
  if (severity === "warning")
    return (
      <StatusPill tone="warn" icon={<WarnTriangle size={11} />}>
        Warning
      </StatusPill>
    );
  return <StatusPill tone="neutral">Note</StatusPill>;
}
