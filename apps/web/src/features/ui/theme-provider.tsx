import { createContext, useContext, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark';
export type Direction = 'painel' | 'mercado' | 'recibo';

/** As 3 direções visuais; rótulo/tagline resolvidos via i18n (`appearance.dir.*`). */
export const DIRECTIONS: { id: Direction }[] = [
  { id: 'painel' },
  { id: 'mercado' },
  { id: 'recibo' },
];

interface ThemeContextValue {
  mode: Mode;
  dir: Direction;
  setMode: (mode: Mode) => void;
  setDir: (dir: Direction) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Tema (claro/escuro) + direção visual da casa. Persiste em localStorage. */
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

/**
 * Raiz visual do app: injeta o container `.gro-app` com data-mode + data-dir, do
 * qual o @grosify/ui herda os tokens --gro-* e se re-tematiza. Envolve toda a UI.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() =>
    lsGet('mode', 'light') === 'dark' ? 'dark' : 'light',
  );
  const [dir, setDirState] = useState<Direction>(() => {
    const v = lsGet('dir', 'recibo');
    return v === 'painel' || v === 'mercado' || v === 'recibo' ? v : 'recibo';
  });

  const setMode = (next: Mode) => {
    setModeState(next);
    lsSet('mode', next);
  };
  const setDir = (next: Direction) => {
    setDirState(next);
    lsSet('dir', next);
  };

  return (
    <ThemeContext.Provider value={{ mode, dir, setMode, setDir }}>
      <div className="gro-app" data-mode={mode} data-dir={dir} style={{ minHeight: '100dvh' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
