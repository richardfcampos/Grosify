import { neededQty } from '@grosify/shared';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { setInventory } from '../db/repositories.js';

/**
 * Inventário: conta o que tem em casa. Para itens em listas recorrentes,
 * mostra quanto falta comprar = max(qtdMensal − emCasa, 0).
 */
export function InventarioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
  const lists = useLiveQuery(() => db.lists.filter((l) => l.deletedAt === null).toArray(), [], []);
  const entries = useLiveQuery(
    () => db.listEntries.filter((e) => e.deletedAt === null).toArray(),
    [],
    [],
  );

  const onHandByItem = useMemo(
    () => new Map(inventory.map((i) => [i.itemId, i.qtyOnHand])),
    [inventory],
  );
  // soma das quantidades mensais (listas recorrentes) por item
  const monthlyByItem = useMemo(() => {
    const recurringListIds = new Set(lists.filter((l) => l.isRecurring).map((l) => l.id));
    const map = new Map<string, number>();
    for (const e of entries) {
      if (recurringListIds.has(e.listId)) map.set(e.itemId, (map.get(e.itemId) ?? 0) + e.qty);
    }
    return map;
  }, [lists, entries]);

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate({ to: '/listas' })} className="text-sm text-zinc-500">
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
            .map((item) => {
              const monthly = monthlyByItem.get(item.id);
              const onHand = onHandByItem.get(item.id) ?? 0;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900">{item.name}</p>
                    {monthly !== undefined && (
                      <p className="text-sm text-green-700">
                        {t('lists.needed')}: {neededQty(monthly, onHand)}{' '}
                        {t(`catalog.units.${item.unit}`)}
                      </p>
                    )}
                  </div>
                  <OnHandInput
                    value={onHand}
                    unit={t(`catalog.units.${item.unit}`)}
                    onCommit={(qty) => setInventory(item.id, qty)}
                  />
                </li>
              );
            })}
        </ul>
      )}
    </main>
  );
}

function OnHandInput({
  value,
  unit,
  onCommit,
}: {
  value: number;
  unit: string;
  onCommit: (qty: number) => void;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(String(value));
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-zinc-400">{t('lists.onHand')}</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={() => {
          const n = Number(local.replace(',', '.'));
          if (n >= 0 && n !== value) onCommit(n);
          else setLocal(String(value));
        }}
        inputMode="decimal"
        className="w-14 rounded-lg border border-zinc-300 px-2 py-1.5 text-center text-base"
      />
      <span className="w-8 text-xs text-zinc-400">{unit}</span>
    </div>
  );
}
