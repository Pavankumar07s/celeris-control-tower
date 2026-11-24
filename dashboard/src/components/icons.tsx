// A tiny inline-SVG icon set (no dependency).  Icons inherit `currentColor`; sizes are in px.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, p: P) => ({ width: size, height: size, "aria-hidden": true as const, focusable: false as const, ...p });

export const ChevronDown = ({ size = 10, ...p }: P) => (
  <svg viewBox="0 0 10 10" {...base(size, p)}>
    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Moon = ({ size = 16, ...p }: P) => (
  <svg viewBox="0 0 16 16" {...base(size, p)}>
    <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);
export const Sun = ({ size = 16, ...p }: P) => (
  <svg viewBox="0 0 16 16" {...base(size, p)}>
    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth={1.4} />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
  </svg>
);
export const LinkIcon = ({ size = 14, ...p }: P) => (
  <svg viewBox="0 0 14 14" {...base(size, p)}>
    <path d="M5.8 8.2l2.4-2.4M6.3 3.6l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1M7.7 10.4l-1 1A2.6 2.6 0 0 1 3 7.7l1-1" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinecap="round" />
  </svg>
);
export const WarnTriangle = ({ size = 12, ...p }: P) => (
  <svg viewBox="0 0 12 12" {...base(size, p)}>
    <path d="M6 1l5.2 9.4H.8z" fill="var(--warn-mark)" />
    <path d="M6 4.6v2.6" stroke="var(--paper)" strokeWidth={1.3} strokeLinecap="round" />
    <circle cx="6" cy="8.7" r=".75" fill="var(--paper)" />
  </svg>
);
export const CheckCircle = ({ size = 12, ...p }: P) => (
  <svg viewBox="0 0 12 12" {...base(size, p)}>
    <circle cx="6" cy="6" r="6" fill="var(--good)" />
    <path d="M3.3 6.2l1.8 1.7 3.6-3.8" stroke="var(--paper)" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const CrossCircle = ({ size = 12, ...p }: P) => (
  <svg viewBox="0 0 12 12" {...base(size, p)}>
    <circle cx="6" cy="6" r="6" fill="var(--crit)" />
    <path d="M4 4l4 4M8 4l-4 4" stroke="var(--paper)" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);
export const Close = ({ size = 14, ...p }: P) => (
  <svg viewBox="0 0 14 14" {...base(size, p)}>
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);
export const Search = ({ size = 14, ...p }: P) => (
  <svg viewBox="0 0 14 14" {...base(size, p)}>
    <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth={1.4} />
    <path d="M9.2 9.2l3 3" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
  </svg>
);
export const Menu = ({ size = 16, ...p }: P) => (
  <svg viewBox="0 0 16 16" {...base(size, p)}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
  </svg>
);
export const ArrowRight = ({ size = 12, ...p }: P) => (
  <svg viewBox="0 0 12 12" {...base(size, p)}>
    <path d="M2 6h7.5M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Download = ({ size = 14, ...p }: P) => (
  <svg viewBox="0 0 14 14" {...base(size, p)}>
    <path d="M7 2v7M4 6.5L7 9.5l3-3M2.5 11.5h9" stroke="currentColor" strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const TableIcon = ({ size = 14, ...p }: P) => (
  <svg viewBox="0 0 14 14" {...base(size, p)}>
    <rect x="2" y="2.5" width="10" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth={1.3} />
    <path d="M2 6h10M2 9h10M6 2.5v9" stroke="currentColor" strokeWidth={1.1} />
  </svg>
);
/** The wordmark glyph: two ink bars and one cobalt bar, the colour grammar in miniature. */
export const Glyph = ({ size = 18, ...p }: P) => (
  <svg viewBox="0 0 18 18" {...base(size, p)}>
    <rect x="1" y="9" width="3" height="8" fill="currentColor" />
    <rect x="6" y="5" width="3" height="12" fill="currentColor" />
    <rect x="11" y="2" width="3" height="15" fill="var(--accent)" />
  </svg>
);
