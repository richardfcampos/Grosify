/* Grosify — shared UI: icon set + primitives. Exposes to window for other babel files. */
const { useState, useEffect, useRef } = React;

/* ---- One consistent line-icon family (stroke, 24px, round) ---- */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  cart: 'M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 8H6.5M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01',
  tag: 'M3.5 12.5 11 5h6.5a1.5 1.5 0 0 1 1.5 1.5V13l-7.5 7.5a1.5 1.5 0 0 1-2.1 0l-5.9-5.9a1.5 1.5 0 0 1 0-2.1ZM15.5 9.5h.01',
  box: 'M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-13L3 8m9 5v8m0-8L3 8v8l9 5',
  gear: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
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
};
function Icon({ name, size = 24, stroke = 1.8, className, style }) {
  return React.createElement('svg', {
    className, width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', style,
  }, React.createElement('path', { d: PATHS[name] || '' }));
}

/* Real @grosify/ui components from the bundle */
const G = window.GrosifyUI;
const { fmtBRL, brl } = window.GroData;

/* Anton money — wraps MoneyValue (superscript cents) */
function Money({ cents, size = 'md', tone = 'default', style }) {
  return React.createElement(G.MoneyValue, { cents: Math.abs(cents), size, tone, style });
}

/* Sparkline from an array of cents */
function Sparkline({ data, w = 96, h = 30, color }) {
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / span) * (h - 4) - 2]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const up = data[data.length - 1] >= data[0];
  const c = color || (up ? 'var(--gro-red)' : 'var(--gro-green)');
  return React.createElement('svg', { className: 'spark', width: w, height: h, viewBox: `0 0 ${w} ${h}` },
    React.createElement('path', { d, fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    React.createElement('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.4, fill: c }));
}

/* Bottom sheet (modal) */
function Sheet({ open, onClose, children, dark }) {
  if (!open) return null;
  return React.createElement('div', {
    className: 'fade', onClick: onClose,
    style: { position: 'absolute', inset: 0, zIndex: 60, background: '#00000066', display: 'flex', alignItems: 'flex-end' },
  }, React.createElement('div', {
    className: 'sheet', onClick: (e) => e.stopPropagation(),
    style: {
      width: '100%', background: dark ? '#1c1917' : 'var(--app-surface)', color: dark ? '#fafaf7' : 'var(--app-ink)',
      borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: '10px 20px 24px', maxHeight: '88%', overflow: 'auto',
    },
  },
    React.createElement('div', { style: { width: 40, height: 4, borderRadius: 99, background: 'var(--app-border)', margin: '6px auto 16px' } }),
    children));
}

function Empty({ icon, title, body, action }) {
  return React.createElement('div', { className: 'fade', style: { textAlign: 'center', padding: '46px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 } },
    React.createElement('div', { style: { width: 76, height: 76, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: 'var(--app-gray)', background: 'repeating-linear-gradient(135deg,var(--app-surface-2) 0 7px,var(--app-bg) 7px 14px)', border: '1px dashed var(--app-border)' } },
      React.createElement(Icon, { name: icon, size: 30, stroke: 1.6 })),
    React.createElement('div', { style: { fontWeight: 700, fontSize: 17 } }, title),
    React.createElement('p', { className: 'muted', style: { margin: '2px 0 0', fontSize: 14, maxWidth: 270, lineHeight: 1.5 } }, body),
    action ? React.createElement('div', { style: { marginTop: 14 } }, action) : null);
}

function CatIcon({ cat }) {
  // simple neutral category dot (no decorative color — brand rule)
  const map = { 'Grãos': 'box', 'Laticínios': 'box', 'Limpeza': 'spark', 'Bebidas': 'box', 'Higiene': 'spark' };
  return React.createElement(Icon, { name: map[cat] || 'box', size: 16, style: { color: 'var(--app-gray)' } });
}

Object.assign(window, { Icon, Money, Sparkline, Sheet, Empty, CatIcon, useState, useEffect, useRef, G });
