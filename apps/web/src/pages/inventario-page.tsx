import { neededQty } from '@grosify/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { adjustInventory, logConsumption, resolveBarcode, setInventory } from '../db/repositories.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { UnknownBarcodeSheet } from '../features/brands/unknown-barcode-sheet.js';
import { Badge, Button, Icon, SectionTitle } from '../features/ui/index.js';

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
    <main className="screen-in flex flex-col gap-4 px-[18px] py-6 pb-28">
      <button
        onClick={() => navigate({ to: '/' })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle
        kicker={t('lists.inventoryTitle')}
        title={t('inventory.title')}
        sub={t('lists.inventoryHint')}
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`inventory.filter.${f}`)}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/itens/novo' })}>
          <Icon name="plus" size={16} /> {t('catalog.newItem')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="muted mt-6 text-center">{t('catalog.noItems')}</p>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
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
        </div>
      )}

      <button
        onClick={() => setScannerOpen(true)}
        className="fab fixed bottom-[calc(6rem_+_env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2"
        style={{ position: 'fixed' }}
        aria-label={t('catalog.scan')}
      >
        <Icon name="scan" size={26} stroke={2} />
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
  const need = recommended != null ? neededQty(recommended, onHand) : 0;
  return (
    <button onClick={onOpen} className="tap flex w-full items-center gap-3 px-4 py-3 text-left">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{item.name}</p>
        <p className="muted mt-0.5 text-[12.5px]">
          {item.category ?? t('catalog.noCategory')}
          {need > 0 && ` · ${t('restock.toBuy')} ${need} ${t(`catalog.units.${item.unit}`)}`}
        </p>
      </div>
      {status !== 'ok' && <Badge tone="neutral">{t(`inventory.status.${status}`)}</Badge>}
      <div className="flex items-center gap-2">
        <span className="kicker">{t('lists.onHand')}</span>
        <span style={{ fontFamily: 'var(--gro-font-money)', fontSize: 22, minWidth: 22, textAlign: 'center' }}>
          {onHand}
        </span>
      </div>
    </button>
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

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{item.name}</h2>

        <div className="seg" style={{ width: '100%' }}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {t(`inventory.${m}`)}
            </button>
          ))}
        </div>

        <label className="muted text-sm">
          {mode === 'consume' ? t('inventory.used') : t('lists.onHand')}
        </label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
          inputMode="decimal"
          className="gro-field gro-field--mono text-lg"
        />
        {mode === 'adjust' && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('inventory.reason')}
            maxLength={200}
            className="gro-field"
          />
        )}

        <Button variant="primary" size="lg" fullWidth type="submit">
          {t('common.save')}
        </Button>

        <div className="mt-1 flex flex-col gap-1">
          <h3 className="kicker">{t('inventory.history')}</h3>
          {history.length === 0 ? (
            <p className="muted text-sm">{t('inventory.noMovements')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((m) => (
                <li key={m.id} className="flex justify-between text-sm">
                  <span className="muted">
                    {t(`inventory.move.${m.type}`)} · {fmtDate(m.movedAt)}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </span>
                  <span className="mono" style={{ color: m.qty < 0 ? 'var(--gro-red)' : 'var(--gro-green)' }}>
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
