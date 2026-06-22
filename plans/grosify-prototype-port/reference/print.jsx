/* Grosify — galeria imprimível (PDF/imagens) de todas as telas. Monta em #root. */
const noop = () => {};
const PT = window.GroTheme;
const dirP = PT.DIR.recibo;
const demoShop = { checked: { i1: { qty: 2, c: 2490 }, i5: { qty: 2, c: 1690 }, i3: { qty: 9, c: 459 }, i9: { qty: 2, c: 419 } }, storeId: 's1' };
const sp = { go: noop, dir: dirP, mode: 'light', shop: demoShop, setShop: noop };

function Frame({ label, full, children }) {
  return (
    <div style={{ breakInside: 'avoid', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontFamily: 'var(--gro-font-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', color: '#57534e', textTransform: 'uppercase' }}>{label}</div>
      <div className="gro-app" data-mode="light" data-dir="recibo"
        style={{ position: 'relative', width: 380, height: full ? 800 : 'auto', minHeight: full ? 0 : 720, overflow: 'hidden', borderRadius: 22, border: '1px solid #e7e5e4', boxShadow: '0 18px 40px -24px #00000040' }}>
        {full ? children : <div style={{ padding: '16px 18px 28px' }}>{children}</div>}
      </div>
    </div>
  );
}

function PrintGallery() {
  const W = window;
  const screens = [
    ['Onboarding', true, <W.Onboarding go={noop} />],
    ['Entrar', true, <W.Auth go={noop} />],
    ['Início', false, <W.Home {...sp} />],
    ['Lista do mês', false, <W.Lista {...sp} route={{ params: { id: 'l1' } }} />],
    ['Lista vazia · estado vazio', false, <W.Lista {...sp} route={{ params: { id: 'l4' } }} />],
    ['Modo Compra · sempre escuro', true, <W.Compra {...sp} route={{ params: { id: 'l1' } }} />],
    ['Scanner', true, <W.Scanner onClose={noop} onResult={noop} />],
    ['Recibo térmico', false, <W.Recibo {...sp} route={{ params: { id: 'l1' } }} />],
    ['Preços', false, <W.Precos {...sp} />],
    ['Detalhe de preço', false, <W.PrecoDetail {...sp} route={{ params: { id: 'i5' } }} />],
    ['Análise de gastos', false, <W.Analise />],
    ['Inventário', false, <W.Estoque {...sp} />],
    ['Casa · membros e lojas', false, <W.Casa />],
    ['Item · formulário', false, <W.ItemForm {...sp} route={{ params: { id: 'i1' } }} />],
    ['Ajustes', false, <W.Ajustes go={noop} mode="light" setMode={noop} dirId="recibo" setDir={noop} dirs={PT.DIRECTIONS} />],
  ];
  return (
    <div style={{ minHeight: '100vh', background: '#f4f3ef' }}>
      <div className="noprint" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e7e5e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: '#15803d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'Anton', fontSize: 18 }}>G</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-.02em', color: '#1c1917' }}>Grosify — Telas</div>
          <div style={{ fontSize: 12.5, color: '#78716c' }}>Direção Recibo · light · 15 telas</div>
        </div>
        <button onClick={() => window.print()} style={{ border: 0, background: '#15803d', color: '#fff', fontFamily: 'Lexend', fontWeight: 700, fontSize: 14, padding: '11px 18px', borderRadius: 11, cursor: 'pointer' }}>Imprimir / Salvar PDF</button>
      </div>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 60px', display: 'flex', flexWrap: 'wrap', gap: '34px 30px', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
        {screens.map(([label, full, node], i) => <Frame key={i} label={label} full={full}>{node}</Frame>)}
      </div>
    </div>
  );
}

PT.ensureStyle();
const st = document.createElement('style');
st.textContent = '@media print{.noprint{display:none!important;}body{background:#fff!important;}@page{margin:12mm;}}';
document.head.appendChild(st);
ReactDOM.createRoot(document.getElementById('root')).render(<PrintGallery />);
