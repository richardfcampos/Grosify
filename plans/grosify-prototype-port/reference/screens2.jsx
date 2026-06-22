/* Grosify screens — Modo Compra (sempre escuro), Recibo, Inventário, Ajustes. */
const Dd = window.GroData;
const { Icon: I2, Money: M2, Sheet: Sh, Empty: E2, G: GG } = window;
const ff = Dd.fmtBRL;
const SectionTitle = window.SectionTitle;

const DARK_VARS = {
  '--gro-surface': '#1c1917', '--gro-ink': '#fafaf7', '--gro-border': '#33302c',
  '--gro-gray': '#a8a29e', '--gro-green': '#4ade80', '--gro-red': '#f87171', '--gro-stamp': '#93c5fd',
};

/* ---------------- MODO COMPRA (always dark) ---------------- */
function Compra({ go, route, shop, setShop }) {
  const l = Dd.LISTS.find((x) => x.id === (route.params.id || 'l1')) || Dd.LISTS[0];
  const items = Dd.listStats(l).needed;
  const [active, setActive] = window.useState(null);
  const [hideBought, setHideBought] = window.useState(false);
  const [slam, setSlam] = window.useState(null);
  const [scanOpen, setScanOpen] = window.useState(false);
  const checked = shop.checked;

  const estimated = items.reduce((s, it) => s + Dd.need(it) * Dd.cheapest(it).c, 0);
  const current = items.reduce((s, it) => (checked[it.id] ? s + checked[it.id].qty * checked[it.id].c : s), 0);
  const over = current > estimated;
  const doneCount = Object.keys(checked).length;
  const budgetPct = l.budget ? Math.min(100, Math.round((current / l.budget) * 100)) : 0;
  const bColor = !l.budget ? '#4ade80' : budgetPct >= 100 ? '#f87171' : budgetPct >= 80 ? '#facc15' : '#4ade80';

  const groups = {};
  (hideBought ? items.filter((it) => !checked[it.id]) : items).forEach((it) => {
    (groups[it.cat] = groups[it.cat] || []).push(it);
  });

  function confirm(it, qty, c) {
    setShop({ ...shop, checked: { ...checked, [it.id]: { qty, c } } });
    setActive(null);
    setSlam(it.id);
    if (navigator.vibrate) navigator.vibrate(18);
    setTimeout(() => setSlam(null), 1000);
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0c0a09', color: '#fafaf7', display: 'flex', flexDirection: 'column', ...DARK_VARS }}>
      {/* sticky header */}
      <div style={{ background: '#161311', padding: '12px 18px 14px', borderBottom: '1px solid #2a2622', flex: 'none' }}>
        <button onClick={() => go('lista', { id: l.id })} style={{ border: 0, background: 'transparent', color: '#a8a29e', font: 'inherit', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Voltar</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="kicker" style={{ color: '#a8a29e' }}>No carrinho</div>
            <M2 cents={current} size="md" tone={over ? 'negative' : 'positive'} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kicker" style={{ color: '#a8a29e' }}>Estimado</div>
            <div className="mono" style={{ fontSize: 16, color: '#d6d3d1' }}>{ff(estimated)}</div>
            {current > 0 && <div className="mono" style={{ fontSize: 12, color: over ? '#f87171' : '#4ade80', marginTop: 2 }}>
              {over ? '▲' : '▼'} {ff(Math.abs(estimated - current))} {over ? 'acima' : 'abaixo'}</div>}
          </div>
        </div>
        {/* budget */}
        {l.budget > 0 && <div style={{ marginTop: 12 }}>
          <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a8a29e', marginBottom: 5 }}>
            <span>Orçamento {ff(l.budget)}</span><span style={{ color: bColor }}>{budgetPct}%</span>
          </div>
          <div className="bar" style={{ background: '#2a2622' }}><i style={{ width: budgetPct + '%', background: bColor }} /></div>
        </div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span className="mono" style={{ fontSize: 12, color: '#a8a29e' }}>{doneCount}/{items.length} comprados</span>
          <button onClick={() => setHideBought((v) => !v)} className="pill" style={{ background: '#2a2622', color: '#e7e5e4', border: 0, cursor: 'pointer', font: 'inherit', fontSize: 12 }}>
            {hideBought ? 'Mostrar comprados' : 'Ocultar comprados'}
          </button>
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 96px' }}>
        {Object.entries(groups).map(([cat, arr]) => (
          <div key={cat} style={{ marginTop: 14 }}>
            <div className="kicker" style={{ color: '#78716c', padding: '0 4px 8px' }}>{cat}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {arr.map((it) => {
                const ch = checked[it.id], price = Dd.cheapest(it);
                return (
                  <button key={it.id} onClick={() => setActive(it)}
                    className={'tap' + (slam === it.id ? ' row-bought' : '')}
                    style={{ minHeight: 64, textAlign: 'left', border: '1px solid #2a2622', background: ch ? '#161311' : '#1c1917',
                      borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, color: '#fafaf7', font: 'inherit', cursor: 'pointer', position: 'relative' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 16, textDecoration: ch ? 'line-through' : 'none', opacity: ch ? 0.55 : 1 }}>{it.name}</div>
                      <div className="mono" style={{ fontSize: 12.5, color: '#a8a29e', marginTop: 3 }}>
                        {ch ? `${ch.qty} × ${ff(ch.c)}` : `${Dd.need(it)} ${it.unit} · ${ff(price.c)}`}
                      </div>
                    </div>
                    {ch
                      ? <span className={slam === it.id ? 'stamp-in' : ''}><GG.Stamp checked label="COMPRADO" /></span>
                      : <span style={{ width: 26, height: 26, borderRadius: 8, border: '2px solid #44403c', flex: 'none' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAB scanner */}
      <button className="fab" style={{ right: 20, bottom: 92 }} onClick={() => setScanOpen(true)} aria-label="Escanear">
        <I2 name="scan" size={26} stroke={2} />
      </button>

      {scanOpen && <window.Scanner onClose={() => setScanOpen(false)} onResult={(it) => { setScanOpen(false); setActive(it); }} />}

      {/* finish bar */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: '#161311', borderTop: '1px solid #2a2622' }}>
        <GG.Button variant="primary" size="lg" fullWidth onClick={() => go('recibo', { id: l.id })}>
          Finalizar compra · {ff(current)}
        </GG.Button>
      </div>

      <Sh open={!!active} onClose={() => setActive(null)} dark>
        {active && <CheckSheet it={active} onConfirm={confirm} />}
      </Sh>
    </div>
  );
}

function CheckSheet({ it, onConfirm }) {
  const base = Dd.cheapest(it);
  const [qty, setQty] = window.useState(Dd.need(it) || 1);
  const [reais, setReais] = window.useState((base.c / 100).toFixed(2).replace('.', ','));
  const cents = Math.round(parseFloat(reais.replace(',', '.') || '0') * 100);
  const up = cents > base.c;
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 19 }}>{it.name}</div>
      <div className="mono muted" style={{ fontSize: 13, marginTop: 4 }}>{it.cat} · menor visto {ff(base.c)}</div>

      <div className="kicker" style={{ margin: '20px 0 8px' }}>Quantidade</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={stepBtn}><I2 name="minus" size={20} /></button>
        <span style={{ fontFamily: 'var(--gro-font-money)', fontSize: 32, minWidth: 48, textAlign: 'center' }}>{qty}</span>
        <button onClick={() => setQty((q) => q + 1)} style={stepBtn}><I2 name="plus" size={20} /></button>
        <span className="muted" style={{ fontSize: 14 }}>{it.unit}</span>
      </div>

      <div className="kicker" style={{ margin: '20px 0 8px' }}>Preço pago (un)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #44403c', borderRadius: 12, padding: '12px 14px' }}>
        <span className="mono" style={{ color: '#a8a29e' }}>R$</span>
        <input value={reais} onChange={(e) => setReais(e.target.value)} inputMode="decimal"
          style={{ border: 0, background: 'transparent', outline: 'none', color: '#fafaf7', font: 'inherit', fontSize: 20, fontFamily: 'var(--gro-font-mono)', width: '100%' }} />
        {up && <GG.Badge tone="subiu">subiu</GG.Badge>}
      </div>
      {up && <div className="mono" style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>▲ {ff(cents - base.c)} acima do menor preço</div>}

      <div style={{ marginTop: 22 }}>
        <GG.Button variant="primary" size="lg" fullWidth onClick={() => onConfirm(it, qty, cents)}>
          Marcar comprado · {ff(qty * cents)}
        </GG.Button>
      </div>
    </div>
  );
}
const stepBtn = { width: 48, height: 48, borderRadius: 12, border: '1px solid #44403c', background: '#2a2622', color: '#fafaf7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

/* ---------------- RECIBO ---------------- */
function Recibo({ go, route, shop }) {
  const l = Dd.LISTS.find((x) => x.id === (route.params.id || 'l1')) || Dd.LISTS[0];
  const items = Dd.listStats(l).needed.filter((it) => shop.checked[it.id]);
  const estimated = Dd.listStats(l).needed.reduce((s, it) => s + Dd.need(it) * Dd.cheapest(it).c, 0);
  const total = items.reduce((s, it) => s + shop.checked[it.id].qty * shop.checked[it.id].c, 0);
  const saved = estimated - total;
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
      <div className="card" style={{ padding: 22, width: '100%', textAlign: 'center', background: 'var(--gro-green)', color: '#fff', border: 0 }}>
        <div className="kicker" style={{ color: '#ffffffcc' }}>{saved >= 0 ? 'Você economizou' : 'Acima do estimado'}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', '--gro-ink': '#fff' }}>
          <M2 cents={Math.abs(saved)} size="lg" />
        </div>
        <div style={{ fontSize: 13, color: '#ffffffcc', marginTop: 6 }}>vs. {ff(estimated)} estimado</div>
      </div>

      {/* thermal receipt */}
      <div className="receipt" style={{ width: '100%', maxWidth: 360, boxShadow: 'var(--app-elev)', fontFamily: 'var(--gro-font-mono)' }}>
        <div className="receipt-edge" />
        <div style={{ padding: '4px 22px 22px' }}>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #00000040', paddingBottom: 12 }}>
            <div style={{ fontFamily: 'var(--gro-font-ui)', fontWeight: 800, fontSize: 18, letterSpacing: '-.01em' }}>GROSIFY</div>
            <div style={{ fontSize: 11, color: '#57534e', marginTop: 4 }}>{l.name.toUpperCase()} · ATACADÃO</div>
            <div style={{ fontSize: 11, color: '#57534e' }}>20/06/2026 · 19h42</div>
          </div>
          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it) => {
              const c = shop.checked[it.id];
              return (
                <div key={it.id} style={{ fontSize: 12.5, color: '#1c1917' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                    <span style={{ fontWeight: 600 }}>{ff(c.qty * c.c)}</span>
                  </div>
                  <div style={{ color: '#78716c', fontSize: 11 }}>{c.qty} × {ff(c.c)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: '1px dashed #00000040', paddingTop: 12, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
            <span>TOTAL</span><span>{ff(total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#15803d', marginTop: 6 }}>
            <span>ECONOMIA</span><span>{ff(saved)}</span>
          </div>
        </div>
        <div className="receipt-edge" style={{ transform: 'rotate(180deg)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 360 }}>
        <GG.Button variant="primary" size="lg" fullWidth><I2 name="share" size={18} /> Compartilhar</GG.Button>
        <GG.Button variant="secondary" size="lg" onClick={() => go('home')} style={{ flex: 'none' }}>Início</GG.Button>
      </div>
    </div>
  );
}

/* ---------------- INVENTÁRIO ---------------- */
function Estoque({ go }) {
  const [filter, setFilter] = window.useState('all');
  const all = Dd.ITEMS;
  const status = (it) => (it.onHand === 0 ? 'out' : it.onHand <= 1 ? 'low' : 'ok');
  const items = all.filter((it) => filter === 'all' ? true : status(it) === filter);
  const filters = [['all', 'Todos'], ['low', 'Acabando'], ['out', 'Zerado']];
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle kicker="O que tem em casa" title="Inventário" sub="Conte o estoque; calculamos o que falta" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="seg">
          {filters.map(([k, lab]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{lab}</button>)}
        </div>
        <GG.Button variant="ghost" size="sm" onClick={() => go('item', {})}><I2 name="plus" size={16} /> Novo item</GG.Button>
      </div>
      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        {items.length === 0 && (
          <E2 icon="box" title={filter === 'out' ? 'Nada zerado' : filter === 'low' ? 'Nada acabando' : 'Sem itens'}
            body={filter === 'all' ? 'Adicione itens ao seu inventário para acompanhar o estoque.' : 'Tudo certo por aqui — nenhum item nesse filtro.'} />
        )}
        {items.map((it) => {
          const s = status(it), need = Dd.need(it);
          return (
            <div key={it.id} className="tap" onClick={() => go('item', { id: it.id })} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{it.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {it.cat}{need > 0 && ` · comprar ${need}`}
                </div>
              </div>
              {s === 'out' && <GG.Badge tone="subiu">Zerado</GG.Badge>}
              {s === 'low' && <GG.Badge tone="oferta">Acabando</GG.Badge>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="kicker">em casa</span>
                <span style={{ fontFamily: 'var(--gro-font-money)', fontSize: 22, minWidth: 22, textAlign: 'center' }}>{it.onHand}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- AJUSTES ---------------- */
function Ajustes({ go, mode, setMode, dirId, setDir, dirs }) {
  const Row = ({ icon, title, sub, right, onClick }) => (
    <div className={onClick ? 'tap' : ''} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default' }}>
      <I2 name={icon} size={20} style={{ color: 'var(--app-gray)', flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
        {sub && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{sub}</div>}
      </div>
      {right || <I2 name="chev" size={18} style={{ color: 'var(--app-gray)' }} />}
    </div>
  );
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionTitle kicker="Casa da Ana" title="Ajustes" />
      <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--app-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I2 name="user" size={24} style={{ color: 'var(--app-gray)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Ana Ribeiro</div>
          <div className="muted" style={{ fontSize: 13 }}>ana@email.com</div>
        </div>
        <GG.Badge tone="oferta">Plano Pro</GG.Badge>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>Aparência</div>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Tema</span>
            <div className="seg">
              <button aria-pressed={mode === 'light'} onClick={() => setMode('light')}><I2 name="sun" size={15} /> Claro</button>
              <button aria-pressed={mode === 'dark'} onClick={() => setMode('dark')}><I2 name="moon" size={15} /> Escuro</button>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--app-line)', paddingTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Direção visual</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{dirs.find((d) => d.id === dirId).tagline}</div>
            <div className="seg" style={{ width: '100%' }}>
              {dirs.map((d) => <button key={d.id} aria-pressed={dirId === d.id} onClick={() => setDir(d.id)} style={{ flex: 1, justifyContent: 'center' }}>{d.label}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>Seus dados</div>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          <Row icon="bolt" title="Sincronizar agora" sub="Sincronizado ✓" right={<GG.Chip variant="synced">Sincronizado ✓</GG.Chip>} />
          <Row icon="clock" title="Histórico de compras" sub="Compras finalizadas" onClick={() => go('historico')} />
          <Row icon="chart" title="Análise de gastos" sub="Gasto por mês e categoria" onClick={() => go('analise')} />
          <Row icon="store" title="Casa, lojas e membros" sub="3 lojas · 2 membros" onClick={() => go('casa')} />
          <Row icon="share" title="Exportar meus dados" sub="Baixa tudo em JSON (LGPD)" />
        </div>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>Conta</div>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          <Row icon="spark" title="Rever introdução" onClick={() => go('onboarding')} />
          <Row icon="back" title="Sair" sub="Voltar para a tela de entrada" onClick={() => go('auth')} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Compra, Recibo, Estoque, Ajustes });
