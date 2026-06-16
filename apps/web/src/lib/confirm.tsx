import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Diálogo de confirmação estilo SweetAlert, com o design do app. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [shown, setShown] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // dispara a animação de entrada no próximo frame
  useEffect(() => {
    if (opts) {
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
  }, [opts]);

  function close(ok: boolean) {
    setShown(false);
    resolver.current?.(ok);
    resolver.current = null;
    // espera a animação de saída antes de desmontar
    setTimeout(() => setOpts(null), 150);
  }

  const danger = opts?.danger;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center px-6 transition-opacity duration-150 ${
            shown ? 'bg-black/50 opacity-100 backdrop-blur-sm' : 'bg-black/0 opacity-0'
          }`}
          onClick={() => close(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl transition-all duration-200 ${
              shown ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
            }`}
          >
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
                danger ? 'bg-red-100' : 'bg-green-100'
              }`}
            >
              {danger ? '⚠️' : '❓'}
            </div>
            {opts.title && (
              <h2 className="mt-4 text-xl font-bold text-zinc-900">{opts.title}</h2>
            )}
            <p className="mt-2 text-zinc-600">{opts.message}</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => close(false)}
                className="min-h-12 flex-1 rounded-xl border border-zinc-200 font-semibold text-zinc-700 active:bg-zinc-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => close(true)}
                className={`min-h-12 flex-1 rounded-xl font-semibold text-white shadow-sm outline-none ${
                  danger ? 'bg-red-600 active:bg-red-700' : 'bg-green-600 active:bg-green-700'
                }`}
              >
                {opts.confirmLabel ?? t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm fora do ConfirmProvider');
  return ctx;
}
