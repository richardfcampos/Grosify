/* Grosify screens — Histórico, Análise, Casa (membros + lojas). */
const D3 = window.GroData;
const { Icon: I3, Money: M3, G: G3 } = window;
const f3 = D3.fmtBRL;
const ST = window.SectionTitle;

const MONTHS = [
  { m: 'Jan', cents: 30120 }, { m: 'Fev', cents: 26540 }, { m: 'Mar', cents: 27680 },
  { m: 'Abr', cents: 31250 }, { m: 'Mai', cents: 28940 }, { m: 'Jun', cents: 25453 },
];
const MEMBERS = [
  { name: 'Ana Ribeiro', role: 'Dona', you: true },
  { name: 'João Ribeiro', role: 'Membro', you: false },
  { name: 'Lia Ribeiro', role: 'Membro', you: false },
];

/* ---------------- HISTÓRICO ---------------- */
function Historico({ go }) {
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ST kicker="Registro auditável" title="Histórico de compras" sub="Toda compra finalizada, com o quanto rendeu" />
      <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
        {D3.HISTORY.map((h) => {
          const d = new Date(h.date + 'T12:00');
          const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
          return (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px' }}>
              <div style={{ textAlign: 'center', minWidth: 46 }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--app-gray)', textTransform: 'uppercase' }}>{date.split(' ')[1]}</div>
                <div style={{ fontFamily: 'var(--gro-font-money)', fontSize: 24, lineHeight: 1 }}>{date.split(' ')[0]}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{h.store}</div>
                <div className="muted mono" style={{ fontSize: 12.5, marginTop: 2 }}>{h.count} itens</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 16 }}>{f3(h.total)}</div>
                <div style={{ margintop: 2 }}><G3.PriceChange deltaCents={-h.saved} /></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="kicker">Economia acumulada (3 meses)</span>
        <M3 cents={6080} size="sm" tone="positive" />
      </div>
    </div>
  );
}

/* ---------------- ANÁLISE DE GASTOS ---------------- */
function Analise() {
  const max = Math.max(...MONTHS.map((m) => m.cents));
  const total = MONTHS.reduce((s, m) => s + m.cents, 0);
  const cats = {};
  D3.ITEMS.forEach((it) => { cats[it.cat] = (cats[it.cat] || 0) + D3.cheapest(it).c * it.rec; });
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(...catRows.map((c) => c[1]));
  const topItems = [...D3.ITEMS].sort((a, b) => D3.cheapest(b).c - D3.cheapest(a).c).slice(0, 5);
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ST kicker="Gestor de dinheiro" title="Análise de gastos" />
      <div className="card" style={{ padding: 20 }}>
        <div className="kicker" style={{ marginBottom: 6 }}>Total · 6 meses</div>
        <M3 cents={total} size="md" />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, marginTop: 22 }}>
          {MONTHS.map((m, i) => (
            <div key={m.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--app-gray)' }}>{(m.cents / 100).toFixed(0)}</div>
              <div style={{ width: '100%', height: (m.cents / max) * 84, borderRadius: 'var(--app-radius) var(--app-radius) 3px 3px',
                background: i === MONTHS.length - 1 ? 'var(--gro-green)' : 'var(--app-surface-2)', border: '1px solid var(--app-border)', transition: 'height .4s' }} />
              <div className="mono" style={{ fontSize: 11, color: 'var(--app-gray)' }}>{m.m}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 10 }}>Gasto por categoria</div>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {catRows.map(([cat, c]) => (
            <div key={cat}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{cat}</span>
                <span className="mono muted">{f3(c)}</span>
              </div>
              <div className="bar"><i style={{ width: (c / catMax * 100) + '%', background: 'var(--app-ink)', opacity: .82 }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 10 }}>Itens mais caros</div>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {topItems.map((it, i) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <span className="mono" style={{ color: 'var(--app-gray)', fontSize: 13, minWidth: 18 }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14.5 }}>{it.name}</span>
              <span className="mono" style={{ fontWeight: 600 }}>{f3(D3.cheapest(it).c)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- CASA (membros + lojas) ---------------- */
function Casa() {
  const [copied, setCopied] = window.useState(false);
  return (
    <div className="screen-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ST kicker="Compartilhado" title="Casa da Ana" sub="Lista, estoque e preços que sua família vê junto" />

      <div className="card" style={{ padding: 18 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Convidar alguém</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="mono" style={{ flex: 1, fontSize: 13, padding: '11px 12px', borderRadius: 10, background: 'var(--app-surface-2)', border: '1px dashed var(--app-border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>grosify.com.br/c/AX9F2K</div>
          <G3.Button variant="secondary" size="sm" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }}>{copied ? 'Copiado!' : 'Copiar'}</G3.Button>
        </div>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 10 }}>Membros</div>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {MEMBERS.map((m) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--app-surface-2)', border: '1px solid var(--app-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--gro-font-money)', fontSize: 18 }}>{m.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{m.name}{m.you && <span className="muted" style={{ fontWeight: 400 }}> · você</span>}</div>
              </div>
              <G3.Badge tone="neutral">{m.role}</G3.Badge>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="kicker" style={{ marginBottom: 10 }}>Lojas</div>
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {D3.STORES.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px' }}>
              <I3 name="store" size={20} style={{ color: 'var(--app-gray)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s.hood} · {s.city}</div>
              </div>
              <I3 name="chev" size={18} style={{ color: 'var(--app-gray)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Historico, Analise, Casa });
