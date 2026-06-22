/* Grosify — theme + 3 visual directions, light/dark. Injects one stylesheet;
   the app container carries data-dir + data-mode and the @grosify/ui bundle
   inherits the --gro-* vars from the cascade so real components re-theme too. */
(function () {
  const DIRECTIONS = [
    {
      id: 'painel', label: 'Painel', tagline: 'Gestor de dinheiro — calmo, dados à frente, ótimo no desktop.',
      radius: 18, card: 'soft', money: 1, nav: 'rail',
    },
    {
      id: 'mercado', label: 'Mercado', tagline: 'Vernáculo de encarte empurrado — dinheiro gigante, etiqueta e carimbo.',
      radius: 14, card: 'hard', money: 1.16, nav: 'bar',
    },
    {
      id: 'recibo', label: 'Recibo', tagline: 'Registro auditável — mono tabular, linhas finas, sobriedade total.',
      radius: 6, card: 'flat', money: 0.92, nav: 'bar',
    },
  ];
  const DIR = Object.fromEntries(DIRECTIONS.map((d) => [d.id, d]));

  const CSS = `
:root{--ease-out:cubic-bezier(.22,1,.36,1);--ease-in-out:cubic-bezier(.65,0,.35,1);}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
.gro-app{font-family:var(--gro-font-ui);background:var(--app-bg);color:var(--app-ink);
  --gro-bg:var(--app-bg);--gro-surface:var(--app-surface);--gro-ink:var(--app-ink);
  --gro-gray:var(--app-gray);--gro-border:var(--app-border);}

/* ---------- LIGHT (default) ---------- */
.gro-app{
  --app-bg:#fafaf7;--app-surface:#ffffff;--app-surface-2:#f4f3ef;--app-ink:#1c1917;
  --app-gray:#78716c;--app-border:#e7e5e4;--app-line:#ece9e4;
  --gro-green:#15803d;--gro-red:#dc2626;--gro-stamp:#1d4ed8;--gro-yellow:#facc15;
  --app-shadow:0 1px 2px #1c19170d,0 8px 24px -12px #1c191726;
  --app-elev:0 1px 3px #1c191712,0 12px 32px -14px #1c19171f;
}
/* ---------- DARK ---------- */
.gro-app[data-mode="dark"]{
  --app-bg:#0c0a09;--app-surface:#1c1917;--app-surface-2:#231f1d;--app-ink:#fafaf7;
  --app-gray:#a8a29e;--app-border:#292524;--app-line:#241f1d;
  --gro-green:#4ade80;--gro-red:#f87171;--gro-stamp:#93c5fd;--gro-yellow:#facc15;
  --app-shadow:0 1px 2px #00000040,0 10px 28px -14px #00000099;
  --app-elev:0 1px 3px #00000059,0 16px 40px -18px #000000b3;
}

/* ---------- DIRECTION: radius + card surface treatment ---------- */
.gro-app{--app-radius:18px;--gro-radius:14px;}
.gro-app[data-dir="painel"]{--app-radius:18px;--gro-radius:14px;}
.gro-app[data-dir="mercado"]{--app-radius:14px;--gro-radius:12px;}
.gro-app[data-dir="recibo"]{--app-radius:6px;--gro-radius:6px;}

.card{background:var(--app-surface);border-radius:var(--app-radius);}
.gro-app[data-dir="painel"] .card{border:1px solid var(--app-border);box-shadow:var(--app-elev);}
.gro-app[data-dir="mercado"] .card{border:1.5px solid var(--app-ink);box-shadow:3px 3px 0 var(--app-ink);}
.gro-app[data-mode="dark"][data-dir="mercado"] .card{border-color:#3a3431;box-shadow:3px 3px 0 #000;}
.gro-app[data-dir="recibo"] .card{border:1px solid var(--app-border);box-shadow:none;}

/* soft hairline row used by recibo lists */
.row-sep>*+*{border-top:1px solid var(--app-line);}
.gro-app[data-dir="recibo"] .row-sep>*+*{border-top:1px dashed var(--app-border);}

/* recibo identity: mono ledger labels + crisper rules */
.gro-app[data-dir="recibo"] .kicker{font-family:var(--gro-font-mono);letter-spacing:.08em;}
.gro-app[data-dir="recibo"] .card{border-color:var(--app-line);}
.gro-app[data-dir="recibo"] h1,.gro-app[data-dir="recibo"] h2{letter-spacing:-.005em;}

/* generic helpers */
.kicker{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--app-gray);}
.muted{color:var(--app-gray);}
.mono{font-family:var(--gro-font-mono);font-variant-numeric:tabular-nums;}
.tap{cursor:pointer;transition:background .12s,transform .08s;}
.tap:active{transform:scale(.985);}
.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;}

/* segmented control (theme + direction switchers) */
.seg{display:inline-flex;background:var(--app-surface-2);border:1px solid var(--app-border);border-radius:999px;padding:3px;gap:2px;}
.seg button{border:0;background:transparent;color:var(--app-gray);font-family:var(--gro-font-ui);font-weight:600;font-size:13px;
  padding:7px 14px;border-radius:999px;cursor:pointer;transition:.15s;display:inline-flex;align-items:center;gap:6px;}
.seg button[aria-pressed="true"]{background:var(--app-surface);color:var(--app-ink);box-shadow:var(--app-shadow);}
.gro-app[data-mode="dark"] .seg button[aria-pressed="true"]{background:#34302d;}

/* bottom nav */
.botnav{display:flex;background:var(--app-surface);border-top:1px solid var(--app-border);}
.botnav button{flex:1;border:0;background:transparent;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:9px 0 calc(9px + env(safe-area-inset-bottom));color:var(--app-gray);font-family:var(--gro-font-ui);font-size:11px;font-weight:600;cursor:pointer;transition:.15s;}
.botnav button[aria-current="true"]{color:var(--gro-green);}
.botnav .ic{width:24px;height:24px;}

/* FAB scanner — yellow only here (money/scan event) */
.fab{position:absolute;width:60px;height:60px;border-radius:50%;background:var(--gro-yellow);color:#1c1917;border:0;
  display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px -4px #00000055,0 2px 4px #00000033;
  transition:transform .12s var(--ease-out);}
.fab:active{transform:scale(.92);}

/* stamp slam — the one expressive moment */
@keyframes stampSlam{0%{opacity:0;transform:scale(2.4) rotate(-26deg);}60%{opacity:1;transform:scale(.92) rotate(-7deg);}
  78%{transform:scale(1.04) rotate(-6deg);}100%{transform:scale(1) rotate(-6deg);}}
.stamp-in{animation:stampSlam .42s var(--ease-out) both;}
@keyframes rowBought{0%{background:transparent;}30%{background:color-mix(in srgb,var(--gro-stamp) 16%,transparent);}100%{background:transparent;}}
.row-bought{animation:rowBought .9s ease-out;}
@keyframes sheetUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
@keyframes scanLine{0%{top:6%;}50%{top:90%;}100%{top:6%;}}
.scanline{position:absolute;left:8%;right:8%;height:2px;background:var(--gro-yellow);box-shadow:0 0 14px 2px #facc1599;animation:scanLine 2.4s ease-in-out infinite;}
.sheet{animation:sheetUp .26s var(--ease-out) both;}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
.fade{animation:fadeIn .2s ease-out both;}
@keyframes screenIn{from{opacity:0;}to{opacity:1;}}
@keyframes slideFromRight{from{opacity:0;transform:translateX(26px);}to{opacity:1;transform:translateX(0);}}
@keyframes slideFromLeft{from{opacity:0;transform:translateX(-26px);}to{opacity:1;transform:translateX(0);}}
@keyframes slideUp{from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:translateY(0);}}
.nav-fwd{animation:slideFromRight .3s var(--ease-out) both;}
.nav-back{animation:slideFromLeft .3s var(--ease-out) both;}
.nav-fade{animation:fadeIn .24s ease-out both;}
.nav-up{animation:slideUp .34s var(--ease-out) both;}
.screen-in{animation:screenIn .26s var(--ease-out) both;}
@media (prefers-reduced-motion:reduce){.stamp-in,.row-bought,.sheet,.fade,.screen-in,.nav-fwd,.nav-back,.nav-fade,.nav-up{animation:none!important;}}

/* receipt serrated edge */
.receipt{background:#fffef9;color:#1c1917;}
.receipt-edge{height:10px;background:
  radial-gradient(circle at 6px 10px,transparent 6px,#fffef9 6px);background-size:12px 10px;background-position:0 -5px;}

/* number scrub for budget bar */
.bar{height:7px;border-radius:999px;background:var(--app-surface-2);overflow:hidden;}
.bar>i{display:block;height:100%;border-radius:999px;transition:width .5s var(--ease-out);}

/* sparkline */
.spark{display:block;}
::-webkit-scrollbar{width:8px;height:8px;}
::-webkit-scrollbar-thumb{background:var(--app-border);border-radius:99px;}
`;

  function ensureStyle() {
    let el = document.getElementById('gro-theme-css');
    if (!el) { el = document.createElement('style'); el.id = 'gro-theme-css'; document.head.appendChild(el); }
    el.textContent = CSS;
  }

  window.GroTheme = { DIRECTIONS, DIR, ensureStyle };
})();
