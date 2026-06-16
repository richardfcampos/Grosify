import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Diálogo de confirmação bonito (substitui window.confirm). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function close(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-6"
          onClick={() => close(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            {opts.title && <h2 className="text-lg font-bold text-zinc-900">{opts.title}</h2>}
            <p className="mt-1 text-zinc-600">{opts.message}</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => close(false)}
                className="min-h-12 flex-1 rounded-xl border border-zinc-300 font-semibold text-zinc-700 active:bg-zinc-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => close(true)}
                className={`min-h-12 flex-1 rounded-xl font-semibold text-white ${
                  opts.danger ? 'bg-red-600 active:bg-red-700' : 'bg-green-600 active:bg-green-700'
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
