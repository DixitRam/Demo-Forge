/** Inline 16px stroke icons — no icon dependency for six glyphs. */
const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconImage = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m3 16 5-4 4 3 3-2 6 5" />
  </svg>
);

export const IconSliders = () => (
  <svg {...base}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export const IconLayout = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
  </svg>
);

export const IconCursor = () => (
  <svg {...base}>
    <path d="m5 3 6.5 16 2.2-6.3L20 10.5 5 3Z" />
  </svg>
);

export const IconZoom = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5M8.5 11h5M11 8.5v5" />
  </svg>
);

export const IconCaption = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 14h4M13 14h4" />
  </svg>
);

export const IconPlay = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

export const IconPause = () => (
  <svg {...base} fill="currentColor" stroke="none">
    <rect x="7" y="5" width="4" height="14" rx="1" />
    <rect x="13" y="5" width="4" height="14" rx="1" />
  </svg>
);

export const IconStart = () => (
  <svg {...base}>
    <path d="M18 5v14L8 12l10-7Z" fill="currentColor" />
    <path d="M6 5v14" />
  </svg>
);

export const IconEnd = () => (
  <svg {...base}>
    <path d="M6 5v14l10-7L6 5Z" fill="currentColor" />
    <path d="M18 5v14" />
  </svg>
);

export const IconStepBack = () => (
  <svg {...base}>
    <path d="M15 6 9 12l6 6" />
  </svg>
);

export const IconStepFwd = () => (
  <svg {...base}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconScript = () => (
  <svg {...base}>
    <path d="M6 3h9l5 5v13H6z" />
    <path d="M15 3v5h5" />
    <path d="M9 12h7M9 16h5" />
  </svg>
);

export const IconScissors = () => (
  <svg {...base}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
  </svg>
);

export const IconTrash = () => (
  <svg {...base}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
);

export const IconFit = () => (
  <svg {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);

export const IconFilm = () => (
  <svg {...base} width={13} height={13}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </svg>
);

export const IconExport = () => (
  <svg {...base} width={14} height={14}>
    <path d="M12 3v12M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </svg>
);
