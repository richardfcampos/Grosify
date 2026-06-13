import { neededQty } from '@grosify/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { findItemIdByBarcode, setInventory } from '../db/repositories.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';

/**
 * Inventário: conta o que tem em casa (digitando ou escaneando o código).
 * Para itens com recomendado/mês, mostra quanto falta comprar = max(alvo − emCasa, 0).
 */
export function InventarioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState<LocalItem | null>(null);

  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );
  const inventory = useLiveQuery(
    () => db.inventory.filter((i) => i.deletedAt === null).toArray(),
    [],
    [],
  );
  const onHandByItem = new Map(inventory.map((i) => [i.itemId, i.qtyOnHand]));

  async function onScanned(barcode: string) {
    const itemId = await findItemIdByBarcode(barcode);
    const item = items.find((i) => i.id === itemId);
    if (item) setScanned(item);
  }

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-28">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate({ to: '/' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
      </header>
      <h1 className="text-2xl font-bold text-zinc-900">{t('lists.inventoryTitle')}</h1>
      <p className="text-sm text-zinc-500">{t('lists.inventoryHint')}</p>

      {items.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('catalog.noItems')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...items]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <InventoryRow
                key={item.id}
                item={item}
                onHand={onHandByItem.get(item.id) ?? 0}
                highlight={scanned?.id === item.id}
              />
            ))}
        </ul>
      )}

      <button
        onClick={() => setScannerOpen(true)}
        className="fixed bottom-24 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-green-600 text-2xl text-white shadow-lg active:bg-green-700"
        aria-label={t('catalog.scan')}
      >
        ▦
      </button>

      {scannerOpen && <ScannerModal onDetect={onScanned} onClose={() => setScannerOpen(false)} />}
      {scanned && (
        <QuickSetSheet
          item={scanned}
          current={onHandByItem.get(scanned.id) ?? 0}
          onClose={() => setScanned(null)}
        />
      )}
    </main>
  );
}

function InventoryRow({
  item,
  onHand,
  highlight,
}: {
  item: LocalItem;
  onHand: number;
  highlight: boolean;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(String(onHand));
  const target = item.monthlyTarget;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border p-3 ${
        highlight ? 'border-green-500 bg-green-50' : 'border-zinc-200'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900">{item.name}</p>
        {target != null && (
          <p className="text-sm text-green-700">
            {t('lists.needed')}: {neededQty(target, onHand)} {t(`catalog.units.${item.unit}`)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-400">{t('lists.onHand')}</span>
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={() => {
            const n = Number(local.replace(',', '.'));
            if (n >= 0 && n !== onHand) setInventory(item.id, n);
            else setLocal(String(onHand));
          }}
          inputMode="decimal"
          className="w-14 rounded-lg border border-zinc-300 px-2 py-1.5 text-center text-base"
        />
        <span className="w-8 text-xs text-zinc-400">{t(`catalog.units.${item.unit}`)}</span>
      </div>
    </li>
  );
}

function QuickSetSheet({
  item,
  current,
  onClose,
}: {
  item: LocalItem;
  current: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(current));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(',', '.'));
    if (n >= 0) setInventory(item.id, n);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-bold text-zinc-900">{item.name}</h2>
        <label className="text-sm text-zinc-600">{t('lists.onHand')}</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          className="min-h-12 rounded-xl border border-zinc-300 px-4 py-3 text-lg"
        />
        <button
          type="submit"
          className="min-h-12 rounded-xl bg-green-600 font-semibold text-white active:bg-green-700"
        >
          {t('common.save')}
        </button>
      </form>
    </div>
  );
}
