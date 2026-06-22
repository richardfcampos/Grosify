import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addBarcode } from '../../db/repositories.js';
import { BrandPicker } from './brand-picker.js';
import { Button } from '../ui/index.js';

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
    <div className="gro-sheet-backdrop" onClick={onDone}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{t('brands.forBarcode')}</h2>
        <p className="mono muted text-sm">{code}</p>
        <BrandPicker itemId={itemId} value={brandId} onChange={setBrandId} />
        <Button variant="primary" size="lg" fullWidth type="button" onClick={confirm} disabled={busy}>
          {busy ? t('common.saving') : t('common.add')}
        </Button>
      </div>
    </div>
  );
}
