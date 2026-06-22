/* Grosify — app shell: responsive mobile/desktop frames, nav, theme + direction + device controls. */
const { useState: uS, useEffect: uE } = React;
const TH = window.GroTheme;
const Ico = window.Icon;

const NAV = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'precos', label: 'Preços', icon: 'tag' },
  { id: 'estoque', label: 'Estoque', icon: 'box' },
  { id: 'ajustes', label: 'Ajustes', icon: 'gear' },
];
const FULLSCREEN = { compra: 1, recibo: 1, onboarding: 1, auth: 1 };
const PARENT = { lista: 'home', preco: 'precos', historico: 'ajustes', analise: 'ajustes', casa: 'ajustes', item: 'estoque' };
const DEPTH = { home: 0, precos: 0, estoque: 0, ajustes: 0, onboarding: 0, auth: 0, lista: 1, preco: 1, item: 1, historico: 1, analise: 1, casa: 1, compra: 2, recibo: 3 };

function lsGet(k, d) { try { return localStorage.getItem('gro.' + k) || d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem('gro.' + k, v); } catch (e) {} }

function App() {
  const [mode, setMode] = uS(() => lsGet('mode', 'light'));
  const [dirId, setDirId] = uS(() => lsGet('dir', 'recibo'));
  const [device, setDevice] = uS(() => lsGet('device', 'mobile'));
  const [route, setRoute] = uS({ name: 'home', params: {} });
  const [shop, setShop] = uS({ checked: {}, storeId: 's1' });
  const dir = TH.DIR[dirId];

  uE(() => { TH.ensureStyle(); }, []);
  uE(() => lsSet('mode', mode), [mode]);
  uE(() => lsSet('dir', dirId), [dirId]);
  uE(() => lsSet('device', device), [device]);

  const go = (name, params = {}) => {
    if (name === 'home' || name === 'compra' || name === 'recibo') setRoute({ name, params });
    else setRoute({ name, params });
    // reset shopping when leaving recibo back home
    if (name === 'home') {/* keep */ }
  };
  const navTo = (name) => { if (name === 'comprar') { setShop({ checked: {}, storeId: 's1' }); setRoute({ name: 'compra', params: { id: 'l1' } }); } else setRoute({ name, params: {} }); };

  const screenProps = { go, route, dir, mode, shop, setShop };
  function renderScreen() {
    switch (route.name) {
      case 'home': return <window.Home {...screenProps} />;
      case 'lista': return <window.Lista {...screenProps} />;
      case 'precos': return <window.Precos {...screenProps} />;
      case 'preco': return <window.PrecoDetail {...screenProps} />;
      case 'compra': return <window.Compra {...screenProps} />;
      case 'recibo': return <window.Recibo {...screenProps} />;
      case 'estoque': return <window.Estoque {...screenProps} />;
      case 'historico': return <window.Historico {...screenProps} />;
      case 'analise': return <window.Analise {...screenProps} />;
      case 'casa': return <window.Casa {...screenProps} />;
      case 'item': return <window.ItemForm {...screenProps} />;
      case 'onboarding': return <window.Onboarding {...screenProps} />;
      case 'auth': return <window.Auth {...screenProps} />;
      case 'ajustes': return <window.Ajustes go={go} mode={mode} setMode={setMode} dirId={dirId} setDir={setDirId} dirs={TH.DIRECTIONS} />;
      default: return <window.Home {...screenProps} />;
    }
  }

  const isFull = FULLSCREEN[route.name];
  const prevName = React.useRef('home');
  const depth = DEPTH[route.name] ?? 0, prevDepth = DEPTH[prevName.current] ?? 0;
  const anim = isFull
    ? (route.name === 'compra' || route.name === 'recibo' ? 'nav-up' : 'nav-fade')
    : depth > prevDepth ? 'nav-fwd' : depth < prevDepth ? 'nav-back' : 'nav-fade';
  uE(() => { prevName.current = route.name; });
  const activeTab = ['home', 'lista'].includes(route.name) ? 'home'
    : route.name === 'precos' || route.name === 'preco' ? 'precos'
      : route.name === 'estoque' || route.name === 'item' ? 'estoque'
        : ['ajustes', 'analise', 'casa', 'historico'].includes(route.name) ? 'ajustes' : 'home';

  return (
    <div style={{ minHeight: '100vh', background: '#deddd6', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Toolbar {...{ dirId, setDirId, mode, setMode, device, setDevice, dirs: TH.DIRECTIONS }} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: device === 'mobile' ? '24px 16px 48px' : '24px 24px 48px', width: '100%' }}>
        {device === 'mobile'
          ? <PhoneFrame mode={mode} dirId={dirId}>
              <AppBody {...{ route, isFull, anim, renderScreen, activeTab, navTo, go, device: 'mobile' }} />
            </PhoneFrame>
          : <DesktopFrame mode={mode} dirId={dirId}>
              <AppBody {...{ route, isFull, anim, renderScreen, activeTab, navTo, go, device: 'desktop' }} />
            </DesktopFrame>}
      </div>
    </div>
  );
}

/* ---- shared app body (header + screen + nav) ---- */
function AppBody({ route, isFull, anim, renderScreen, activeTab, navTo, go, device }) {
  const desktop = device === 'desktop';
  if (isFull) return <div key={route.name} className={anim} style={{ position: 'absolute', inset: 0 }}>{renderScreen()}</div>;
  const parent = PARENT[route.name];
  const BackBar = parent ? (
    <button onClick={() => go(parent)} style={{ border: 0, background: 'transparent', color: 'var(--app-gray)', font: 'inherit', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
      <window.Icon name="back" size={17} /> Voltar
    </button>
  ) : null;

  if (desktop) {
    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <Rail activeTab={activeTab} navTo={navTo} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div className={anim} style={{ maxWidth: 740, margin: '0 auto', padding: '28px 40px 60px' }} key={route.name}>
            {BackBar}
            {renderScreen()}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className={anim} style={{ flex: 1, overflow: 'auto', padding: '14px 18px 24px' }} key={route.name}>
        {BackBar}
        {renderScreen()}
      </div>
      <BottomNav activeTab={activeTab} navTo={navTo} />
    </div>
  );
}

function BottomNav({ activeTab, navTo }) {
  return (
    <div className="botnav" style={{ flex: 'none' }}>
      {NAV.slice(0, 2).map((n) => <NavBtn key={n.id} n={n} active={activeTab === n.id} onClick={() => navTo(n.id)} />)}
      <button onClick={() => navTo('comprar')} style={{ flex: 'none', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 }}>
        <span style={{ width: 50, height: 50, borderRadius: 16, background: 'var(--gro-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px -6px var(--gro-green)' }}>
          <Ico name="cart" size={24} stroke={2} />
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gro-green)', marginTop: 2 }}>Comprar</span>
      </button>
      {NAV.slice(2).map((n) => <NavBtn key={n.id} n={n} active={activeTab === n.id} onClick={() => navTo(n.id)} />)}
    </div>
  );
}
function NavBtn({ n, active, onClick }) {
  return (
    <button aria-current={active} onClick={onClick}>
      <Ico name={n.icon} size={23} className="ic" stroke={active ? 2.1 : 1.8} />
      {n.label}
    </button>
  );
}

function Rail({ activeTab, navTo }) {
  const items = [NAV[0], NAV[1], { id: 'comprar', label: 'Comprar', icon: 'cart' }, NAV[2], NAV[3]];
  return (
    <div style={{ width: 220, flex: 'none', borderRight: '1px solid var(--app-border)', background: 'var(--app-surface)', padding: '24px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 22px' }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--gro-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--gro-font-money)', fontSize: 18 }}>G</span>
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em' }}>Grosify</span>
      </div>
      {items.map((n) => {
        const active = n.id === 'comprar' ? false : activeTab === n.id;
        const isBuy = n.id === 'comprar';
        return (
          <button key={n.id} onClick={() => navTo(n.id)} aria-current={active}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 11, border: 0, cursor: 'pointer',
              font: 'inherit', fontWeight: 600, fontSize: 14.5, textAlign: 'left', width: '100%',
              background: active ? 'var(--app-surface-2)' : isBuy ? 'var(--gro-green)' : 'transparent',
              color: isBuy ? '#fff' : active ? 'var(--app-ink)' : 'var(--app-gray)' }}>
            <Ico name={n.icon} size={20} stroke={active || isBuy ? 2.1 : 1.8} /> {n.label}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div className="muted" style={{ fontSize: 11, padding: '0 12px' }}>Casa da Ana · Plano Pro</div>
    </div>
  );
}

/* ---- frames ---- */
function PhoneFrame({ children, mode, dirId }) {
  return (
    <div style={{ width: 392, flex: 'none', borderRadius: 52, padding: 11, background: mode === 'dark' ? '#1a1614' : '#111', boxShadow: '0 40px 80px -30px #00000080, 0 4px 12px #00000040' }}>
      <div className="gro-app" data-mode={mode} data-dir={dirId} style={{ position: 'relative', height: 800, borderRadius: 42, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontSize: 13, fontWeight: 600, zIndex: 40, pointerEvents: 'none', color: 'var(--app-ink)' }}>
          <span>9:41</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ width: 17, height: 10, border: '1.4px solid currentColor', borderRadius: 3, opacity: .9, display: 'inline-block' }} />
          </span>
        </div>
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 110, height: 26, background: '#000', borderRadius: 20, zIndex: 45 }} />
        <div style={{ position: 'absolute', inset: 0, paddingTop: 30, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  );
}

function DesktopFrame({ children, mode, dirId }) {
  return (
    <div style={{ width: 'min(1120px, 100%)', flex: 'none', borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 90px -40px #00000066, 0 8px 24px -12px #00000040', border: '1px solid #00000018' }}>
      <div style={{ height: 40, background: mode === 'dark' ? '#1a1614' : '#e9e7e1', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', flex: 'none' }}>
        <span style={{ width: 12, height: 12, borderRadius: 99, background: '#ff5f57' }} />
        <span style={{ width: 12, height: 12, borderRadius: 99, background: '#febc2e' }} />
        <span style={{ width: 12, height: 12, borderRadius: 99, background: '#28c840' }} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: mode === 'dark' ? '#a8a29e' : '#78716c', fontFamily: 'var(--gro-font-ui)' }}>app.grosify.com.br</div>
      </div>
      <div className="gro-app" data-mode={mode} data-dir={dirId} style={{ position: 'relative', height: 720 }}>{children}</div>
    </div>
  );
}

/* ---- floating control toolbar (neutral, theme-independent) ---- */
function Toolbar({ dirId, setDirId, mode, setMode, device, setDevice, dirs }) {
  const seg = { display: 'inline-flex', background: '#f4f3ef', border: '1px solid #00000014', borderRadius: 999, padding: 3, gap: 2 };
  const btn = (on) => ({ border: 0, background: on ? '#fff' : 'transparent', color: on ? '#1c1917' : '#78716c', fontWeight: 600, fontSize: 13, fontFamily: 'Lexend, sans-serif', padding: '7px 13px', borderRadius: 999, cursor: 'pointer', boxShadow: on ? '0 1px 3px #0000001f' : 'none', display: 'inline-flex', alignItems: 'center', gap: 6 });
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100, width: '100%', display: 'flex', justifyContent: 'center', padding: '14px 16px', background: 'linear-gradient(#deddd6, #deddd6f0)', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', background: '#fff', borderRadius: 999, padding: '6px 8px', boxShadow: '0 4px 18px -8px #00000040, 0 1px 2px #00000014' }}>
        <span style={{ fontWeight: 800, fontFamily: 'Lexend, sans-serif', fontSize: 14, padding: '0 6px 0 10px', color: '#1c1917', letterSpacing: '-.02em' }}>Grosify</span>
        <div style={seg}>
          {dirs.map((d) => <button key={d.id} style={btn(dirId === d.id)} onClick={() => setDirId(d.id)} title={d.tagline}>{d.label}</button>)}
        </div>
        <div style={seg}>
          <button style={btn(mode === 'light')} onClick={() => setMode('light')}><Ico name="sun" size={15} /></button>
          <button style={btn(mode === 'dark')} onClick={() => setMode('dark')}><Ico name="moon" size={15} /></button>
        </div>
        <div style={seg}>
          <button style={btn(device === 'mobile')} onClick={() => setDevice('mobile')}>Mobile</button>
          <button style={btn(device === 'desktop')} onClick={() => setDevice('desktop')}>Desktop</button>
        </div>
        <a href="Grosify Telas.html" target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', border: 0, background: '#1c1917', color: '#fff', fontWeight: 600, fontSize: 13, fontFamily: 'Lexend, sans-serif', padding: '8px 14px', borderRadius: 999, cursor: 'pointer' }}>
          <Ico name="share" size={14} /> Exportar PDF
        </a>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
