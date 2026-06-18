import { neededQty } from '@grosify/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { adjustInventory, logConsumption, resolveBarcode, setInventory } from '../db/repositories.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { UnknownBarcodeSheet } from '../features/brands/unknown-barcode-sheet.js';

type StockStatus = 'ok' | 'low' | 'out';
type Filter = 'all' | 'low' | 'out';

function statusOf(onHand: number, min: number | null | undefined): StockStatus {
  if (onHand <= 0) return 'out';
  if (min != null && onHand <= min) return 'low';
  return 'ok';
}

/**
 * Inventário: conta o que tem em casa, registra consumo/ajuste e mostra movimentos.
 * Status colorido por estoque mínimo; filtros acabando/zerado.
 */
export function InventarioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [active, setActive] = useState<LocalItem | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );
  const inventory = useLiveQuery(() => db.inventory.filter((i) => i.deletedAt === null).toArray(), [], []);
  const lists = useLiveQuery(
    () => db.lists.filter((l) => l.deletedAt === null && l.isRecurring).toArray(),
    [],
    [],
  );
  const entries = useLiveQuery(() => db.listEntries.filter((e) => e.deletedAt === null).toArray(), [], []);

  const onHandByItem = new Map(inventory.map((i) => [i.itemId, Number(i.qtyOnHand)]));
  const recommendedByItem = new Map<string, number>();
  const recurringIds = new Set(lists.map((l) => l.id));
  for (const e of entries) {
    if (recurringIds.has(e.listId))
      recommendedByItem.set(e.itemId, (recommendedByItem.get(e.itemId) ?? 0) + e.qty);
  }

  const rows = useMemo(() => {
    return [...items]
      .map((item) => {
        const onHand = onHandByItem.get(item.id) ?? 0;
        return { item, onHand, status: statusOf(onHand, item.minStock) };
      })
      .filter((r) => (filter === 'all' ? true : filter === 'out' ? r.status === 'out' : r.status !== 'ok'))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, inventory, filter]);

  async function onScanned(barcode: string) {
    const itemId = (await resolveBarcode(barcode))?.itemId ?? null;
    if (!itemId) {
      setUnknownCode(barcode);
      return;
    }
    const item = items.find((i) => i.id === itemId);
    if (item) setActive(item);
  }

  const FILTERS: Filter[] = ['all', 'low', 'out'];

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-28">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate({ to: '/' })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
      </header>
      <h1 className="text-2xl font-bold text-zinc-900">{t('lists.inventoryTitle')}</h1>
      <p className="text-sm text-zinc-500">{t('lists.inventoryHint')}</p>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              filter === f ? 'bg-green-600 text-white' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            {t(`inventory.filter.${f}`)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('catalog.noItems')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ item, onHand, status }) => (
            <InventoryRow
              key={item.id}
              item={item}
              onHand={onHand}
              status={status}
              recommended={recommendedByItem.get(item.id)}
              onOpen={() => setActive(item)}
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
      {unknownCode && (
        <UnknownBarcodeSheet
          code={unknownCode}
          onResolved={async (itemId) => {
            setUnknownCode(null);
            const item = await db.items.get(itemId);
            if (item) setActive(item);
          }}
          onClose={() => setUnknownCode(null)}
        />
      )}
      {active && (
        <InventorySheet
          item={active}
          current={onHandByItem.get(active.id) ?? 0}
          onClose={() => setActive(null)}
        />
      )}
    </main>
  );
}

const STATUS_STYLE: Record<StockStatus, string> = {
  ok: 'border-zinc-200',
  low: 'border-amber-400 bg-amber-50',
  out: 'border-red-400 bg-red-50',
};

function InventoryRow({
  item,
  onHand,
  status,
  recommended,
  onOpen,
}: {
  item: LocalItem;
  onHand: number;
  status: StockStatus;
  recommended: number | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        onClick={onOpen}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${STATUS_STYLE[status]}`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-900">{item.name}</p>
          {recommended != null && (
            <p className="text-sm text-green-700">
              {t('lists.needed')}: {neededQty(recommended, onHand)} {t(`catalog.units.${item.unit}`)}
            </p>
          )}
          {item.minStock != null && status !== 'ok' && (
            <p className="text-xs text-amber-700">
              {t(`inventory.status.${status}`)} · {t('catalog.minStock')} {item.minStock}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-lg text-zinc-900">{onHand}</p>
          <p className="text-xs text-zinc-400">{t(`catalog.units.${item.unit}`)}</p>
        </div>
      </button>
    </li>
  );
}

type Mode = 'count' | 'consume' | 'adjust';

function InventorySheet({
  item,
  current,
  onClose,
}: {
  item: LocalItem;
  current: number;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('count');
  const [value, setValue] = useState(String(current));
  const [reason, setReason] = useState('');

  const movements = useLiveQuery(
    () =>
      db.movements
        .where('itemId')
        .equals(item.id)
        .filter((m) => m.deletedAt === null)
        .toArray(),
    [item.id],
    [],
  );
  const history = [...movements].sort((a, b) => b.movedAt.localeCompare(a.movedAt)).slice(0, 8);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    if (mode === 'count') await setInventory(item.id, n);
    else if (mode === 'consume') await logConsumption(item.id, n);
    else await adjustInventory(item.id, n, reason);
    onClose();
  }

  const MODES: Mode[] = ['count', 'consume', 'adjust'];
  const inputCls = 'min-h-12 w-full rounded-xl border border-zinc-300 px-4 py-3 text-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="mx-auto flex max-h-[88dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-bold text-zinc-900">{item.name}</h2>

        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                mode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {t(`inventory.${m}`)}
            </button>
          ))}
        </div>

        <label className="text-sm text-zinc-600">
          {mode === 'consume' ? t('inventory.used') : t('lists.onHand')}
        </label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          className={inputCls}
        />
        {mode === 'adjust' && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('inventory.reason')}
            maxLength={200}
            className="min-h-11 w-full rounded-xl border border-zinc-300 px-4 text-base"
          />
        )}

        <button
          type="submit"
          className="min-h-12 rounded-xl bg-green-600 font-semibold text-white active:bg-green-700"
        >
          {t('common.save')}
        </button>

        <div className="mt-1 flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-zinc-600">{t('inventory.history')}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-400">{t('inventory.noMovements')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((m) => (
                <li key={m.id} className="flex justify-between text-sm">
                  <span className="text-zinc-600">
                    {t(`inventory.move.${m.type}`)} · {fmtDate(m.movedAt)}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </span>
                  <span className={`font-mono ${m.qty < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {m.qty > 0 ? '+' : ''}
                    {m.qty} → {m.balanceAfter}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </div>
  );
}
