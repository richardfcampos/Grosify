import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addBarcode } from '../../db/repositories.js';
import { BrandPicker } from './brand-picker.js';

interface Props {
  itemId: string;
  code: string;
  onDone: () => void;
}

/** Após escanear, escolhe a qual marca esse código pertence (ou sem marca) e salva. */
export function BarcodeBrandChooser({ itemId, code, onDone }: Props) {
  const { t } = useTranslation();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await addBarcode(itemId, code, brandId);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onDone}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-bold text-zinc-900">{t('brands.forBarcode')}</h2>
        <p className="font-mono text-sm text-zinc-500">{code}</p>
        <BrandPicker itemId={itemId} value={brandId} onChange={setBrandId} />
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="min-h-12 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('common.add')}
        </button>
      </div>
    </div>
  );
}
