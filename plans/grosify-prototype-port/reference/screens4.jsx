/* Grosify — Scanner overlay (usado no Modo Compra) + Formulário de item. */
const D4 = window.GroData;
const { Icon: I4, G: G4 } = window;
const f4 = D4.fmtBRL;
const ST4 = window.SectionTitle;

/* ---------------- SCANNER (dark viewfinder) ---------------- */
function Scanner({ onClose, onResult }) {
  const [code, setCode] = window.useState('');
  const items = D4.ITEMS;
  const pick = () => onResult(items[Math.floor(Math.random() * items.length)]);
  return (
    <div className="fade" style={{ position: 'absolute', inset: 0, zIndex: 80, background: '#000', color: '#fafaf7', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px' }}>
        <button onClick={onClose} style={{ border: 0, background: '#ffffff1a', color: '#fff', width: 38, height: 38, borderRadius: 99, cursor: 'pointer', fontSize: 18 }}>✕</button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>Escanear código</span>
        <button style={{ border: 0, background: '#ffffff1a', color: '#fff', width: 38, height: 38, borderRadius: 99, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Lanterna">
          <I4 name="bolt" size={18} />
        </button>
      </div>

      {/* viewfinder */}
      <div style={{ flex: 1, position: 'relative', margin: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: '1 / 1', background: 'repeating-linear-gradient(135deg,#111 0 14px,#161616 14px 28px)', borderRadius: 18, overflow: 'hidden' }}>
          {['tl', 'tr', 'bl', 'br'].map((c) => (
            <span key={c} style={{ position: 'absolute', width: 36, height: 36, borderColor: 'var(--gro-yellow)', borderStyle: 'solid', borderWidth: 0,
              top: c[0] === 't' ? 12 : 'auto', bottom: c[0] === 'b' ? 12 : 'auto', left: c[1] === 'l' ? 12 : 'auto', right: c[1] === 'r' ? 12 : 'auto',
              borderTopWidth: c[0] === 't' ? 4 : 0, borderBottomWidth: c[0] === 'b' ? 4 : 0, borderLeftWidth: c[1] === 'l' ? 4 : 0, borderRightWidth: c[1] === 'r' ? 4 : 0,
              borderRadius: 4 }} />
          ))}
          <span className="scanline" />
        </div>
      </div>

      <div style={{ textAlign: 'center', color: '#a8a29e', fontSize: 13.5, padding: '14px 0 0' }}>Aponte para o código de barras</div>

      <div style={{ padding: '16px 24px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="Ou digite o código"
            style={{ flex: 1, border: '1px solid #333', background: '#161616', color: '#fff', borderRadius: 12, padding: '13px 14px', font: 'inherit', fontSize: 15, fontFamily: 'var(--gro-font-mono)', outline: 'none' }} />
          <G4.Button variant="primary" size="md" onClick={pick} style={{ flex: 'none' }}>OK</G4.Button>
        </div>
        <button onClick={pick} className="pill" style={{ alignSelf: 'center', background: 'var(--gro-yellow)', color: '#1c1917', border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, padding: '10px 18px' }}>
          <I4 name="scan" size={18} stroke={2} /> Simular leitura
        </button>
      </div>
    </div>
  );
}

/* ---------------- ITEM FORM (novo / editar) ---------------- */
function ItemForm({ route, go }) {
  const editing = !!(route.params && route.params.id);
  const it = editing ? D4.ITEM[route.params.id] : null;
  const [name, setName] = window.useState(it ? it.name : '');
  const cats = ['Grãos', 'Laticínios', 'Bebidas', 'Limpeza', 'Higiene'];
  const units = [['un', 'unidade'], ['kg', 'kg'], ['g', 'g'], ['l', 'litro'], ['ml', 'ml']];

  const FieldWrap = ({ label, children }) => (
    <label style={{ display: 'block' }}>
      <span className="kicker" style={{ display: 'block', marginBottom: 7 }}>{label}</span>
      {children}
    </label>
  );
  const inp = { width: '100%', border: '1px solid var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-ink)', borderRadius: 12, padding: '13px 14px', font: 'inherit', fontSize: 15, outline: 'none' };

  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{editing ? 'Editar item' : 'Novo item'}</h1>

      {/* photo placeholder */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: 'var(--app-radius)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'repeating-linear-gradient(135deg,var(--app-surface-2) 0 8px,var(--app-bg) 8px 16px)', border: '1px dashed var(--app-border)', color: 'var(--app-gray)' }}>
          <I4 name="plus" size={22} />
        </div>
        <div className="mono muted" style={{ fontSize: 12, lineHeight: 1.5 }}>foto do produto<br />(toque para adicionar)</div>
      </div>

      <FieldWrap label="Nome do item">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Arroz branco 5kg" style={inp} />
      </FieldWrap>

      <div style={{ display: 'flex', gap: 12 }}>
        <FieldWrap label="Categoria">
          <select defaultValue={it ? it.cat : 'Grãos'} style={inp}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        </FieldWrap>
        <FieldWrap label="Unidade">
          <select defaultValue={it ? it.unit : 'un'} style={inp}>{units.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </FieldWrap>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <FieldWrap label="Recomendado / mês">
          <input type="number" defaultValue={it ? it.rec : 1} style={{ ...inp, fontFamily: 'var(--gro-font-mono)' }} />
        </FieldWrap>
        <FieldWrap label="Em casa">
          <input type="number" defaultValue={it ? it.onHand : 0} style={{ ...inp, fontFamily: 'var(--gro-font-mono)' }} />
        </FieldWrap>
      </div>

      <div>
        <span className="kicker" style={{ display: 'block', marginBottom: 8 }}>Códigos de barras</span>
        <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <I4 name="scan" size={18} style={{ color: 'var(--app-gray)' }} />
          <span className="mono" style={{ flex: 1, fontSize: 13, color: editing ? 'var(--app-ink)' : 'var(--app-gray)' }}>{editing ? '789' + (1000000 + route.params.id.charCodeAt(1) * 137) : 'Nenhum código ainda'}</span>
          <G4.Button variant="ghost" size="sm">Escanear</G4.Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <G4.Button variant="primary" size="lg" fullWidth onClick={() => go('estoque')}>Salvar</G4.Button>
        {editing && <G4.Button variant="secondary" size="lg" onClick={() => go('estoque')} style={{ flex: 'none' }}>Excluir</G4.Button>}
      </div>
    </div>
  );
}

Object.assign(window, { Scanner, ItemForm });
