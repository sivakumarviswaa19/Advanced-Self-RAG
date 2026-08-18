/**
 * Inline SVG icon set. Square caps and joins, 1.5 stroke, 16px grid —
 * the drafting-tool language the rest of the console speaks.
 */
type P = { className?: string };

const base = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
  "aria-hidden": true,
  focusable: false as const,
};

export const Plus = ({ className }: P) => (
  <svg {...base} className={className}><path d="M8 3v10M3 8h10" /></svg>
);

export const Trash = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5M6.8 7v3.5M9.2 7v3.5" />
  </svg>
);

export const Close = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);

export const Chevron = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 6.5 8 10.5l4-4" /></svg>
);

export const ArrowUp = ({ className }: P) => (
  <svg {...base} className={className}><path d="M8 13V3.5M3.8 7.7 8 3.5l4.2 4.2" /></svg>
);

export const Doc = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 2h5l3 3v9H4zM9 2v3h3" />
  </svg>
);

export const Tray = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2.5 9.5v4h11v-4M8 2.5v7M5 6l3-3.5L11 6" />
  </svg>
);

export const Loop = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M13 7.2A5 5 0 0 0 4.2 4.4M3 8.8a5 5 0 0 0 8.8 2.8M3.2 3.6v2.8H6M12.8 12.4V9.6H10" />
  </svg>
);

export const Check = ({ className }: P) => (
  <svg {...base} className={className}><path d="M3.5 8.5 6.5 11.5 12.5 5" /></svg>
);

export const Pencil = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M11.2 2.8 13.2 4.8 5.5 12.5 2.8 13.2 3.5 10.5z" />
  </svg>
);

export const Panel = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2.5 3h11v10h-11zM6.5 3v10" />
  </svg>
);

export const Copy = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M5.5 5.5h8v8h-8zM10.5 5.5V2.5h-8v8h3" />
  </svg>
);

export const Alert = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M8 2.5 14.5 13.5h-13zM8 6.8v3M8 11.6v.6" />
  </svg>
);
