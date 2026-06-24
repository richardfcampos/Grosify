import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark' | 'system';
export type Direction = 'painel' | 'mercado' | 'recibo';

/** As 3 direções visuais; rótulo/tagline resolvidos via i18n (`appearance.dir.*`). */
export const DIRECTIONS: { id: Direction }[] = [
  { id: 'painel' },
  { id: 'mercado' },
  { id: 'recibo' },
];

interface ThemeContextValue {
  /** A escolha do usuário (inclui 'system'). */
  mode: Mode;
  /** O modo efetivamente aplicado (system → resolve pelo OS). */
  resolvedMode: 'light' | 'dark';
  dir: Direction;
  setMode: (mode: Mode) => void;
  setDir: (dir: Direction) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Tema (claro/escuro/sistema) + direção visual. Cache instantâneo em localStorage;
 *  a preferência salva na conta (banco) é aplicada no login pelo AppLayout. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>');
  return ctx;
}

function lsGet(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`gro.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(`gro.${key}`, value);
  } catch {
    // ignora — modo privado / storage cheio
  }
}
function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/**
 * Raiz visual do app: injeta o container `.gro-app` com data-mode + data-dir, do
 * qual o @grosify/ui herda os tokens --gro-* e se re-tematiza. Envolve toda a UI.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const v = lsGet('mode', 'system');
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  });
  const [dir, setDirState] = useState<Direction>(() => {
    const v = lsGet('dir', 'recibo');
    return v === 'painel' || v === 'mercado' || v === 'recibo' ? v : 'recibo';
  });
  const [sysDark, setSysDark] = useState(systemPrefersDark);

  // Acompanha a troca de tema do sistema (só importa quando mode === 'system').
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedMode: 'light' | 'dark' = mode === 'system' ? (sysDark ? 'dark' : 'light') : mode;

  // Casa a barra de status + o fundo do documento com o --app-bg do modo atual.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.gro-app');
    if (!el) return;
    const bg = getComputedStyle(el).getPropertyValue('--app-bg').trim();
    if (!bg) return;
    // overscroll/safe-area atrás de tudo (evita branco no topo/baixo no rubber-band)
    document.documentElement.style.backgroundColor = bg;
    // barra de status nos browsers que reagem (Chrome, iOS recente). Tira o `media` pra a
    // escolha MANUAL valer independente do SO; iOS antigo cai nos metas media do index.html.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.removeAttribute('media');
      m.setAttribute('content', bg);
    });
  }, [resolvedMode]);

  const setMode = (next: Mode) => {
    setModeState(next);
    lsSet('mode', next);
  };
  const setDir = (next: Direction) => {
    setDirState(next);
    lsSet('dir', next);
  };

  return (
    <ThemeContext.Provider value={{ mode, resolvedMode, dir, setMode, setDir }}>
      <div className="gro-app" data-mode={resolvedMode} data-dir={dir} style={{ minHeight: '100dvh' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
