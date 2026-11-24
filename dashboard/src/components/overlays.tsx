// Floating surfaces: popover, the "i" info popover (what · how · source), drawer and toasts.
// Only these float: they get --raised, a 1px rule border, a 10px radius and --shadow-pop.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Close } from "./icons";

/** Close on outside click and on Escape while `open`. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement & HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export interface PopoverProps {
  /** Trigger content (rendered inside a <button>). */
  trigger: ReactNode;
  triggerClassName?: string;
  ariaLabel?: string;
  title?: string;
  /** Which edge of the trigger the popover aligns to. */
  align?: "left" | "right";
  width?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}

/** A click-to-open popover anchored to its trigger (Escape and outside click close it). */
export function Popover({ trigger, triggerClassName = "btn", ariaLabel, title, align = "right", width = 340, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const id = useId();
  return (
    <span className="info-wrap" ref={ref}>
      <button type="button" className={triggerClassName} aria-label={ariaLabel} title={title} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && (
        <div id={id} className={`popover ${align}`} role="dialog" style={{ width }}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </span>
  );
}

export interface InfoProps {
  /** What the module shows. */
  what: ReactNode;
  /** How it is computed. */
  how?: ReactNode;
  /** Source file(s) in the bundle, e.g. "forecast.json". */
  source?: string;
  align?: "left" | "right";
  size?: "sm" | "md";
}

/** The "i" popover every module carries: what it shows · how it is computed · source file. */
export function Info({ what, how, source, align = "right", size = "md" }: InfoProps) {
  return (
    <Popover trigger="i" triggerClassName={`info-btn ${size === "sm" ? "sm" : ""}`} ariaLabel="About this module" align={align}>
      <p>
        <b>What it shows.</b> {what}
      </p>
      {how && (
        <p>
          <b>How it is computed.</b> {how}
        </p>
      )}
      {source && (
        <p>
          <b>Source.</b> <code>{source}</code>
        </p>
      )}
    </Popover>
  );
}

export interface DrawerProps {
  title: ReactNode;
  /** Identity line under the headline. */
  sub?: ReactNode;
  /** Kicker above the headline, sentence case, e.g. "Case 1 of 286, lost account". */
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/** Right-hand drawer over a 30 % paper scrim (case file, lineage).  Escape closes; focus moves inside. */
export function Drawer({ title, sub, eyebrow, onClose, children, width }: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", on);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", on);
      prev?.focus?.();
    };
  }, []);
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" ref={ref} tabIndex={-1} style={width ? { width: `min(${width}px, 94vw)` } : undefined}>
        <div className="drawer-head">
          <div>
            {eyebrow && <span className="kicker">{eyebrow}</span>}
            <h2>{title}</h2>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

// ---- toasts: bottom-left, auto-dismiss after 4 s ---------------------------------------------------
type ToastMsg = { id: number; text: string };
const listeners = new Set<(t: ToastMsg) => void>();
let nextId = 1;
/** Show a toast from anywhere: toast("Link copied"). */
export function toast(text: string) {
  const t = { id: nextId++, text };
  listeners.forEach((l) => l(t));
}
/** Mount once in the shell. */
export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (t: ToastMsg) => {
      setItems((xs) => [...xs, t]);
      window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
