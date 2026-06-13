import { estimateTotal } from '@grosify/shared';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem, type LocalSessionItem } from '../db/dexie.js';
import { completeSession, findItemIdByBarcode, uncheckSessionItem } from '../db/repositories.js';
import { CheckItemSheet } from '../features/shopping/check-item-sheet.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { useFormatMoney } from '../lib/use-currency.js';

export function CompraPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const { id } = useParams({ from: '/app/compra/$id' });

  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const sessionItems = useLiveQuery(
    () => db.sessionItems.where('sessionId').equals(id).filter((i) => i.deletedAt === null).toArray(),
    [id],
    [] as LocalSessionItem[],
  );
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );

  const [active, setActive] = useState<LocalSessionItem | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const estimated = useMemo(
    () =>
      estimateTotal(
        sessionItems.map((si) => ({ qty: si.neededQty, unitPriceCents: si.estimatedUnitPriceCents })),
      ).totalCents,
    [sessionItems],
  );
  const current = useMemo(
    () =>
      sessionItems.reduce(
        (sum, si) =>
          si.checkedAt && si.actualUnitPriceCents && si.actualQty
            ? sum + Math.round(si.actualQty * si.actualUnitPriceCents)
            : sum,
        0,
      ),
    [sessionItems],
  );
  const over = current > estimated;
  const checkedCount = sessionItems.filter((si) => si.checkedAt).length;

  async function onScanned(barcode: string) {
    const itemId = await findItemIdByBarcode(barcode);
    if (!itemId) return;
    const si = sessionItems.find((s) => s.itemId === itemId);
    if (si) setActive(si);
  }

  if (!session) return null;

  if (session.status === 'completed') {
    return (
      <Summary
        sessionItems={sessionItems}
        itemById={itemById}
        estimated={estimated}
        current={current}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-50">
      <header className="sticky top-0 z-10 bg-stone-900 px-5 pb-4 pt-3">
        <button
          onClick={() => navigate({ to: '/' })}
          className="mb-2 text-sm text-stone-400"
        >
          ← {t('shopping.back')}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">{t('shopping.current')}</p>
            <p className="font-['Anton'] text-2xl" style={{ color: over ? '#F87171' : '#4ADE80' }}>
              {fmt(current)}
            </p>
          </div>
          <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-stone-400">{t('shopping.estimated')}</p>
          <p className="font-mono text-sm text-stone-300">{fmt(estimated)}</p>
          {current > 0 && (
            <p className="font-mono text-xs" style={{ color: over ? '#F87171' : '#4ADE80' }}>
              {over ? '▲' : '▼'} {fmt(Math.abs(estimated - current))} {over ? t('shopping.above') : t('shopping.below')}
            </p>
          )}
          </div>
        </div>
      </header>

      <main className="px-5 py-4 pb-32">
        {sessionItems.length === 0 ? (
          <p className="mt-8 text-center text-stone-400">{t('shopping.emptySession')}</p>
        ) : (
          <ul className="flex flex-col">
            {sessionItems.map((si) => {
              const item = itemById.get(si.itemId);
              if (!item) return null;
              const done = !!si.checkedAt;
              return (
                <li
                  key={si.id}
                  className="relative flex min-h-16 items-center gap-3 border-b border-stone-800 py-2"
                  onClick={() => (done ? uncheckSessionItem(si.id) : setActive(si))}
                >
                  <div className={`min-w-0 flex-1 ${done ? 'opacity-40' : ''}`}>
                    <p className="font-medium">{item.name}</p>
                    <p className="font-mono text-xs text-stone-400">
                      {si.checkedAt && si.actualUnitPriceCents
                        ? `${si.actualQty} × ${fmt(si.actualUnitPriceCents)}`
                        : `${si.neededQty} ${t(`catalog.units.${item.unit}`)}`}
                    </p>
                  </div>
                  {done && (
                    <span className="absolute right-3 -rotate-[8deg] rounded-md border-[2.5px] border-blue-300 px-2.5 py-0.5 text-xs font-extrabold tracking-wider text-blue-300">
                      ✓ {t('shopping.bought')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-center gap-3 bg-stone-900 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => setScannerOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400 text-xl"
        >
          ▦
        </button>
        <button
          onClick={async () => {
            await completeSession(id);
          }}
          disabled={checkedCount === 0}
          className="min-h-12 flex-1 rounded-xl bg-green-600 font-bold text-white disabled:opacity-40"
        >
          {t('shopping.finish')}
        </button>
      </div>

      {active && (
        <CheckItemSheet
          sessionItem={active}
          itemName={itemById.get(active.itemId)?.name ?? ''}
          onClose={() => setActive(null)}
        />
      )}
      {scannerOpen && <ScannerModal onDetect={onScanned} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}

function Summary({
  sessionItems,
  itemById,
  estimated,
  current,
}: {
  sessionItems: LocalSessionItem[];
  itemById: Map<string, LocalItem>;
  estimated: number;
  current: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const saved = estimated - current;
  const boughtItems = sessionItems.filter((si) => si.checkedAt);

  function receiptText(): string {
    const lines = [`🛒 Grosify — ${t('shopping.receiptTag')}`];
    for (const si of boughtItems) {
      const name = itemById.get(si.itemId)?.name ?? '';
      if (si.actualUnitPriceCents && si.actualQty) {
        lines.push(`${name}  ${si.actualQty}×${fmt(si.actualUnitPriceCents)}`);
      }
    }
    lines.push('—');
    lines.push(`${t('shopping.current')}: ${fmt(current)}`);
    lines.push(
      saved >= 0
        ? `✓ ${t('shopping.savedVsEstimate', { amount: fmt(saved) })}`
        : t('shopping.overEstimate', { amount: fmt(-saved) }),
    );
    return lines.join('\n');
  }

  async function onShare() {
    const text = receiptText();
    if (navigator.share) {
      await navigator.share({ text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 bg-stone-950 px-6 text-center text-stone-50">
      <h1 className="text-2xl font-bold">{t('shopping.summary')}</h1>
      <p className="font-['Anton'] text-4xl" style={{ color: saved >= 0 ? '#4ADE80' : '#F87171' }}>
        {fmt(current)}
      </p>
      <p className="text-stone-300">{t('shopping.itemsBought', { count: boughtItems.length })}</p>
      <p className="text-lg font-semibold" style={{ color: saved >= 0 ? '#4ADE80' : '#F87171' }}>
        {saved >= 0
          ? t('shopping.savedVsEstimate', { amount: fmt(saved) })
          : t('shopping.overEstimate', { amount: fmt(-saved) })}
      </p>
      <button
        onClick={onShare}
        className="mt-4 min-h-12 w-full rounded-xl bg-green-600 px-8 font-bold text-white"
      >
        {t('shopping.share')}
      </button>
      <button
        onClick={() => navigate({ to: '/listas' })}
        className="min-h-12 w-full rounded-xl bg-yellow-400 px-8 font-bold text-stone-900"
      >
        {t('shopping.back')}
      </button>
    </main>
  );
}
