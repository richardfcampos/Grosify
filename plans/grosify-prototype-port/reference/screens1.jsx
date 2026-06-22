/* Grosify screens — Home, Lista detail, Preços. */
const D = window.GroData;
const { Icon: Ic, Money: M, Sparkline: Spark, CatIcon: Cat, Empty: Em, G: GU } = window;
const f = D.fmtBRL;

function SectionTitle({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {kicker && <div className="kicker" style={{ marginBottom: 6 }}>{kicker}</div>}
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</h2>
      {sub && <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{sub}</p>}
    </div>
  );
}

/* ---------------- HOME / DASHBOARD ---------------- */
function Home({ go, dir }) {
  const lists = D.LISTS;
  const due = lists.find((l) => l.due);
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* top identity bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--gro-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--gro-font-money)', fontSize: 17, flex: 'none' }}>G</span>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-.01em' }}>Casa da Ana</span>
        <div style={{ flex: 1 }} />
        <GU.Chip variant="synced">Sincronizado ✓</GU.Chip>
        <button onClick={() => go('historico')} aria-label="Histórico" style={{ border: 0, background: 'transparent', color: 'var(--app-gray)', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <Ic name="clock" size={22} />
        </button>
      </div>

      {/* hero — preço protagonista */}
      <div className="card" style={{ padding: dir.id === 'recibo' ? '20px 22px' : 26, overflow: 'hidden', position: 'relative' }}>
        <div className="kicker">Você economizou em {D.monthLabel}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 8 }}>
          <div style={{ transform: `scale(${dir.money})`, transformOrigin: 'left bottom' }}>
            <M cents={D.savedThisMonth} size="lg" tone="positive" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
          <Stat label="Abaixo do estimado" value="3 de 4 listas" />
          <Stat label="Melhor preço pego" value="Café 500g" tag />
        </div>
      </div>

      <div>
        <SectionTitle kicker="Reposição do mês" title="O que falta comprar" sub="Calculado pelo seu estoque" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lists.map((l) => {
            const st = D.listStats(l);
            return (
              <button key={l.id} className="card tap" onClick={() => go('lista', { id: l.id })}
                style={{ textAlign: 'left', padding: 16, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', font: 'inherit' }}>
                <span style={{ fontSize: 26, lineHeight: 1, filter: 'grayscale(.15)' }}>{l.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                    {l.due && <GU.Badge tone="oferta" style={{ fontSize: 10 }}>Hoje é dia</GU.Badge>}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                    {st.missing > 0 ? `${st.missing} itens faltando` : 'Estoque em dia'}
                    {st.noPrice > 0 && ` · ${st.noPrice} sem preço`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted kicker" style={{ marginBottom: 2 }}>estimado</div>
                  <div className="mono" style={{ fontWeight: 600, fontSize: 15 }}>{f(st.total)}</div>
                </div>
                <Ic name="chev" size={18} style={{ color: 'var(--app-gray)', flex: 'none' }} />
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <GU.Button variant="primary" size="lg" fullWidth onClick={() => go('lista', { id: due ? due.id : 'l1' })}>
          Iniciar compra
        </GU.Button>
        <GU.Button variant="secondary" size="lg" onClick={() => go('estoque')} style={{ flex: 'none', whiteSpace: 'nowrap' }}>
          Inventário
        </GU.Button>
      </div>
    </div>
  );
}
function Stat({ label, value, tag }) {
  return (
    <div style={{ flex: '1 1 130px' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>{label}</div>
      {tag
        ? <GU.PriceTag>{value}</GU.PriceTag>
        : <div style={{ fontWeight: 600, fontSize: 15 }}>{value}</div>}
    </div>
  );
}

/* ---------------- LISTA DETAIL ---------------- */
function Lista({ go, route, dir }) {
  const l = D.LISTS.find((x) => x.id === route.params.id) || D.LISTS[0];
  const st = D.listStats(l);
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 30 }}>{l.icon}</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{l.name}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
            <GU.Badge tone="neutral">{l.recurring ? l.recurrence : 'Avulsa'}</GU.Badge>
            {l.budget > 0 && <GU.Badge tone="neutral">Orçamento {f(l.budget)}</GU.Badge>}
          </div>
        </div>
      </div>

      {st.items.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <Em icon="list" title="Lista vazia"
            body="Adicione itens para o app calcular sozinho o que falta comprar todo mês."
            action={<GU.Button variant="primary" size="md" onClick={() => go('item', {})}><Ic name="plus" size={18} /> Adicionar item</GU.Button>} />
        </div>
      ) : (
        <React.Fragment>
      <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="kicker" style={{ marginBottom: 6 }}>Total estimado</div>
          <M cents={st.total} size="md" />
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          {st.missing > 0
            ? <GU.Badge tone="economia">{st.missing} a comprar</GU.Badge>
            : <GU.Badge tone="neutral">Estoque em dia</GU.Badge>}
          {st.noPrice > 0 && <span className="muted mono" style={{ fontSize: 12 }}>{st.noPrice} sem preço</span>}
        </div>
      </div>

      {st.missing > 0
        ? <GU.Button variant="primary" size="lg" fullWidth onClick={() => go('compra', { id: l.id })}>
            <Ic name="cart" size={20} /> Iniciar compra
          </GU.Button>
        : <div className="card" style={{ padding: '14px 16px', textAlign: 'center' }}><span className="muted" style={{ fontSize: 13.5 }}>Tudo o que essa lista pede já está em casa. ✓</span></div>}

      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        {st.items.map((it) => {
          const need = D.need(it), ch = D.cheapest(it), store = D.STORE[ch.s];
          return (
            <div key={it.id} className="tap" onClick={() => go('preco', { id: it.id })}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', opacity: need ? 1 : 0.5 }}>
              <Cat cat={it.cat} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {need ? `Comprar ${need} ${it.unit}` : 'Em casa'} · {store.name}
                  {it.offer && <GU.Badge tone="oferta" style={{ fontSize: 9, padding: '2px 6px' }}>oferta</GU.Badge>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{f(ch.c)}</div>
                {it.delta !== 0 && <GU.PriceChange deltaCents={it.delta} />}
              </div>
            </div>
          );
        })}
      </div>
      <GU.Button variant="ghost" size="md" fullWidth><Ic name="plus" size={18} /> Adicionar item</GU.Button>
        </React.Fragment>
      )}
    </div>
  );
}

/* ---------------- PREÇOS (lista) ---------------- */
function Precos({ go }) {
  const [q, setQ] = window.useState('');
  const items = D.ITEMS.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle kicker="Inteligência de preço" title="Preços" sub="Onde está mais barato e como variou" />
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <Ic name="search" size={18} style={{ color: 'var(--app-gray)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item…"
          style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, font: 'inherit', fontSize: 15, color: 'inherit' }} />
      </div>
      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        {items.length === 0 && (
          <Em icon="search" title="Nada encontrado" body={`Nenhum item bate com "${q}". Tente outro nome.`} />
        )}
        {items.map((it) => {
          const ch = D.cheapest(it), store = D.STORE[ch.s];
          return (
            <div key={it.id} className="tap" onClick={() => go('preco', { id: it.id })}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{it.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Mais barato em {store.name}</div>
              </div>
              <Spark data={it.hist} />
              <div style={{ textAlign: 'right', minWidth: 78 }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 15 }}>{f(ch.c)}</div>
                {it.delta !== 0 && <GU.PriceChange deltaCents={it.delta} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- PREÇO DETAIL ---------------- */
function PrecoDetail({ route }) {
  const it = D.ITEM[route.params.id] || D.ITEMS[0];
  const sorted = [...it.prices].sort((a, b) => a.c - b.c);
  const avg = Math.round(it.hist.reduce((a, b) => a + b, 0) / it.hist.length);
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{it.name}</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{it.cat} · recomendado {it.rec}/mês</div>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Mais barato hoje</div>
            <M cents={sorted[0].c} size="md" tone="positive" />
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>em {D.STORE[sorted[0].s].name}</div>
          </div>
          <GU.PriceTag>Melhor preço</GU.PriceTag>
        </div>
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
          <Spark data={it.hist} w={260} h={64} />
        </div>
        <div className="mono muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>Média 90 dias: {f(avg)}</div>
      </div>
      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }} className="kicker">
          <span>Loja</span><span>Preço</span>
        </div>
        {sorted.map((p, i) => (
          <div key={p.s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ic name="store" size={18} style={{ color: 'var(--app-gray)' }} />
              <span style={{ fontWeight: i === 0 ? 600 : 500, fontSize: 15 }}>{D.STORE[p.s].name}</span>
              {i === 0 && <GU.Badge tone="economia" style={{ fontSize: 10 }}>aqui</GU.Badge>}
            </div>
            <span className="mono" style={{ fontWeight: 600, fontSize: 15, color: i === 0 ? 'var(--gro-green)' : 'inherit' }}>{f(p.c)}</span>
          </div>
        ))}
      </div>
      <GU.Button variant="secondary" size="md" fullWidth><Ic name="plus" size={18} /> Registrar preço</GU.Button>
    </div>
  );
}

Object.assign(window, { Home, Lista, Precos, PrecoDetail, SectionTitle });
