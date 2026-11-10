import type { ReactNode } from 'react';

/** Line icons used across Verity. Same paths and stroke widths as the prototype. */
function Svg({ children, sw = 2 }: { children: ReactNode; sw?: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}

export const I = {
  check: <Svg sw={2.6}><path d="M4 12.5l5 5L20 6" /></Svg>,
  plus: <Svg sw={2.2}><path d="M12 5v14M5 12h14" /></Svg>,
  search: <Svg><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>,
  chev: <Svg><path d="M6 9l6 6 6-6" /></Svg>,
  close: <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  edit: <Svg><path d="M4 20h4L19 9l-4-4L4 16v4z" /></Svg>,
  dup: <Svg><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></Svg>,
  promote: <Svg><path d="M12 19V6M6 11l6-6 6 6" /><path d="M5 21h14" /></Svg>,
  trash: <Svg><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></Svg>,
  clock: <Svg><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>,
  spark: <Svg><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Svg>,
  upload: <Svg><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Svg>,
  ext: <Svg><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></Svg>,
  sun: <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>,
  moon: <Svg><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></Svg>,
  shield: <Svg><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></Svg>,
  refresh: <Svg><path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" /></Svg>,
  list: <Svg><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></Svg>,
  copy: <Svg><rect x="3" y="7" width="12" height="13" rx="2" /><path d="M9 3h10a2 2 0 012 2v10" /></Svg>,
  info: <Svg><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></Svg>,
  cal: <Svg><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></Svg>,
  map: <Svg><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></Svg>,
  chat: <Svg><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /><path d="M8.5 11h7M8.5 14h4" /></Svg>,
  download: <Svg><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></Svg>,
  cloud: <Svg><path d="M7 18h10a4 4 0 00.5-8A6 6 0 006 9.5 4.3 4.3 0 007 18z" /></Svg>
};

export function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
