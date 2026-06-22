import type { CSSProperties } from 'react';

/** Família de ícones de linha (stroke, 24px, cantos redondos) — uma só identidade. */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  cart: 'M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 8H6.5M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01',
  tag: 'M3.5 12.5 11 5h6.5a1.5 1.5 0 0 1 1.5 1.5V13l-7.5 7.5a1.5 1.5 0 0 1-2.1 0l-5.9-5.9a1.5 1.5 0 0 1 0-2.1ZM15.5 9.5h.01',
  box: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-13L3 8m9 5v8m0-8L3 8v8l9 5',
  gear: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm8.4 3.5a8.4 8.4 0 0 0 0-2l1.8-1.3-1.8-3.1-2.1.9a8 8 0 0 0-1.7-1l-.3-2.2H8.9l-.3 2.2a8 8 0 0 0-1.7 1l-2.1-.9L3 9.7 4.8 11a8.4 8.4 0 0 0 0 2L3 14.3l1.8 3.1 2.1-.9a8 8 0 0 0 1.7 1l.3 2.2h5.4l.3-2.2a8 8 0 0 0 1.7-1l2.1.9 1.8-3.1Z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  scan: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  check: 'M5 12.5 10 17l9-10',
  share: 'M16 6l-4-4-4 4M12 2v13M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v4l3 2',
  store: 'M4 9V7l1.5-3h13L20 7v2M4 9h16M4 9v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M5 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 2 0',
  trend: 'M4 16l5-5 3 3 7-8M21 6h-4M21 6v4',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v5m0 3h.01',
  chart: 'M4 4v16h16M8 16v-4M12 16V8M16 16v-7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  bolt: 'M13 3 4 14h6l-1 7 9-11h-6l1-7Z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5 9 9M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5',
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 24, stroke = 1.8, className, style }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
