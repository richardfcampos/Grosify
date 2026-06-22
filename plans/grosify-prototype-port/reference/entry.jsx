/* Grosify — entrada: Onboarding (carrossel) + Auth (entrar/criar conta). Fullscreen dentro do frame. */
const De = window.GroData;
const { Icon: Ie, Money: Me, G: Ge } = window;
const fe = De.fmtBRL;

const SLIDES = [
  {
    k: '01', t: 'Suas listas, do seu jeito',
    b: 'Crie listas do mês ou avulsas (churrasco, festa). O app calcula o que falta comprar pelo seu estoque.',
    vig: 'list',
  },
  {
    k: '02', t: 'Preço certo, loja certa',
    b: 'Registre preços e veja onde está mais barato. A gente avisa quando um preço sobe.',
    vig: 'price',
  },
  {
    k: '03', t: 'Compre offline, sem stress',
    b: 'No mercado, escaneie e marque. Veja o total em tempo real — funciona sem internet.',
    vig: 'stamp',
  },
];

function Vignette({ kind }) {
  const wrap = { width: '100%', maxWidth: 300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 };
  if (kind === 'list') {
    return (
      <div style={wrap}>
        {[['Arroz 5kg', '2 un', true], ['Café 500g', '2 un', false], ['Leite 1L', '9 un', false]].map(([n, q, off], i) => (
          <div key={i} className="card" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid var(--app-border)', flex: 'none' }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{n}</div>
              <div className="muted mono" style={{ fontSize: 11.5 }}>comprar {q}</div>
            </div>
            {off && <Ge.Badge tone="oferta">oferta</Ge.Badge>}
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'price') {
    return (
      <div style={wrap}>
        <div className="card" style={{ padding: 20, textAlign: 'left' }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Café torrado 500g</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Me cents={1690} size="md" tone="positive" />
            <Ge.PriceTag>Melhor preço</Ge.PriceTag>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>em Assaí · caiu este mês</span>
            <Ge.PriceChange deltaCents={-200} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...wrap, alignItems: 'center' }}>
      <div className="card" style={{ padding: 24, width: 220, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0c0a09', borderColor: '#2a2622' }}>
        <div style={{ textAlign: 'left' }}>
          <div className="mono" style={{ fontSize: 11, color: '#a8a29e' }}>Arroz 5kg</div>
          <div className="mono" style={{ fontSize: 13, color: '#fafaf7', marginTop: 3, textDecoration: 'line-through', opacity: .6 }}>2 × R$ 24,90</div>
        </div>
        <span style={{ ['--gro-stamp']: '#93c5fd' }}><Ge.Stamp checked label="COMPRADO" /></span>
      </div>
    </div>
  );
}

function Onboarding({ go }) {
  const [i, setI] = window.useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  return (
    <div className="gro-app-inherit" style={{ position: 'absolute', inset: 0, background: 'var(--app-bg)', color: 'var(--app-ink)', display: 'flex', flexDirection: 'column', padding: '34px 26px 26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gro-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--gro-font-money)', fontSize: 16 }}>G</span>
        <button onClick={() => go('auth')} style={{ border: 0, background: 'transparent', color: 'var(--app-gray)', font: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Pular</button>
      </div>

      <div className="fade" key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 30 }}>
        <Vignette kind={s.vig} />
        <div style={{ textAlign: 'center' }}>
          <div className="kicker" style={{ marginBottom: 10 }}>{s.k} / 03</div>
          <h1 style={{ margin: 0, fontSize: 27, fontWeight: 700, letterSpacing: '-.02em', textWrap: 'balance' }}>{s.t}</h1>
          <p className="muted" style={{ margin: '12px auto 0', fontSize: 15, maxWidth: 300, lineHeight: 1.5, textWrap: 'pretty' }}>{s.b}</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {SLIDES.map((_, n) => (
            <span key={n} onClick={() => setI(n)} style={{ height: 6, flex: n === i ? 2.4 : 1, borderRadius: 99, cursor: 'pointer', background: n === i ? 'var(--gro-green)' : 'var(--app-border)', transition: 'flex .3s, background .3s' }} />
          ))}
        </div>
        <Ge.Button variant="primary" size="md" onClick={() => (last ? go('auth') : setI(i + 1))}>
          {last ? 'Começar' : 'Próximo'}
        </Ge.Button>
      </div>
    </div>
  );
}

/* ---------------- AUTH ---------------- */
function Auth({ go }) {
  const [signup, setSignup] = window.useState(false);
  const Field = ({ label, type, ph, mono }) => (
    <label style={{ display: 'block' }}>
      <span className="kicker" style={{ display: 'block', marginBottom: 7 }}>{label}</span>
      <input type={type || 'text'} placeholder={ph}
        style={{ width: '100%', border: '1px solid var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-ink)',
          borderRadius: 12, padding: '13px 14px', font: 'inherit', fontSize: 15, outline: 'none', fontFamily: mono ? 'var(--gro-font-mono)' : 'inherit' }} />
    </label>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--app-bg)', color: 'var(--app-ink)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '26px', overflow: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 26 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--gro-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--gro-font-money)', fontSize: 22 }}>G</span>
          <span style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.02em' }}>Grosify</span>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>{signup ? 'Criar conta' : 'Entrar no Grosify'}</h1>
        <p className="muted" style={{ margin: '0 0 22px', fontSize: 14 }}>Sua lista, estoque e preços, em qualquer aparelho.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {signup && <Field label="Seu nome" ph="ex.: Ana Ribeiro" />}
          <Field label="E-mail" type="email" ph="voce@email.com" mono />
          <Field label="Senha" type="password" ph={signup ? 'mínimo 8 caracteres' : '••••••••'} mono />
          <div style={{ marginTop: 6 }}>
            <Ge.Button variant="primary" size="lg" fullWidth onClick={() => go('home')}>{signup ? 'Criar conta' : 'Entrar'}</Ge.Button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14 }}>
          <span className="muted">{signup ? 'Já tem conta?' : 'Não tem conta?'} </span>
          <button onClick={() => setSignup((v) => !v)} style={{ border: 0, background: 'transparent', color: 'var(--gro-green)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
            {signup ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Onboarding, Auth });
