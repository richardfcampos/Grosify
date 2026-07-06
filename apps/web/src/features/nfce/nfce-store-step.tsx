import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../db/dexie.js';
import type { NfceEmitente } from '../../lib/nfce-import.js';

interface Props {
  emitente: NfceEmitente;
  /** Loja resolvida (existente por CNPJ ou nova a criar) — o caller usa no confirm. */
  onResolved: (store: { storeId: string | null; createName: string | null }) => void;
}

/**
 * Passo de loja da revisão: casa o emitente da nota por CNPJ contra `stores`
 * local; se não achar, pré-preenche o nome do emitente pra criar uma loja nova
 * (o caller cria via `createStore` só na confirmação — nada é gravado aqui).
 */
export function NfceStoreStep({ emitente, onResolved }: Props) {
  const { t } = useTranslation();
  const stores = useLiveQuery(
    () => db.stores.filter((s) => s.deletedAt === null).toArray(),
    [],
    [] as Array<{ id: string; name: string; cnpj?: string | null }>,
  );
  const matched = stores.find((s) => s.cnpj && s.cnpj === emitente.cnpj);
  const [createName, setCreateName] = useState(emitente.nome);

  // Loja já existe por CNPJ: resolve automaticamente (nada pra revisar aqui).
  useEffect(() => {
    if (matched) onResolved({ storeId: matched.id, createName: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched?.id]);

  if (matched) {
    return (
      <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: 'var(--app-surface-2)' }}>
        <span className="kicker">{t('nfce.storeStepTitle')}</span>
        <p className="mt-0.5 font-medium">{matched.name}</p>
        <p className="muted text-[12px]">{t('nfce.storeMatchedByCnpj')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="kicker">{t('nfce.storeStepTitle')}</span>
      <p className="muted text-[12px]">{t('nfce.storeCreateNew')}</p>
      <input
        value={createName}
        onChange={(e) => {
          setCreateName(e.target.value);
          onResolved({ storeId: null, createName: e.target.value });
        }}
        placeholder={t('catalog.storeName')}
        className="gro-field"
      />
    </div>
  );
}
