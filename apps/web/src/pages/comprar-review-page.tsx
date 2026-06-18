import { useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { previewSessionLines, startShoppingSessionWith, type SessionLine } from '../db/repositories.js';

/**
 * Revisão antes de iniciar a compra: confirma o que falta (recorrente desconta
 * estoque), permite ajustar quantidade e excluir itens já em estoque.
 */
export function ComprarReviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ from: '/app/listas/$id/comprar' });

  const list = useLiveQuery(() => db.lists.get(id), [id]);
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [lines, setLines] = useState<SessionLine[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [showInStock, setShowInStock] = useState(false);
  const [busy, setBusy] = useState(false);

  // carrega linhas uma vez; exclui por padrão o que já tem estoque (needed<=0)
  useEffect(() => {
    previewSessionLines(id).then((ls) => {
      setLines(ls);
      setQty(Object.fromEntries(ls.map((l) => [l.itemId, String(l.needed)])));
      setExcluded(new Set(ls.filter((l) => l.needed <= 0).map((l) => l.itemId)));
    });
  }, [id]);

  const visible = showInStock ? lines : lines.filter((l) => l.needed > 0);

  async function start() {
    setBusy(true);
    const chosen = lines
      .filter((l) => !excluded.has(l.itemId))
      .map((l) => ({ itemId: l.itemId, neededQty: Number((qty[l.itemId] ?? '0').replace(',', '.')) }))
      .filter((l) => l.neededQty > 0);
    if (chosen.length === 0) {
      setBusy(false);
      return;
    }
    const sid = await startShoppingSessionWith(id, chosen);
    navigate({ to: '/compra/$id', params: { id: sid } });
  }

  const inStockCount = lines.filter((l) => l.needed <= 0).length;

  return (
    <main className="flex flex-col gap-4 px-5 py-6 pb-28">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: '/listas/$id', params: { id } })} className="text-sm text-zinc-500">
          ← {t('common.back')}
        </button>
        <h1 className="text-xl font-bold text-zinc-900">{t('review.title')}</h1>
      </header>
      {list && <p className="text-sm text-zinc-500">{list.name}</p>}

      {visible.length === 0 ? (
        <p className="mt-6 text-center text-zinc-500">{t('review.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((l) => {
            const item = itemById.get(l.itemId);
            if (!item) return null;
            const off = excluded.has(l.itemId);
            return (
              <li
                key={l.itemId}
                className={`flex items-center gap-3 rounded-2xl border p-3 ${off ? 'border-zinc-200 opacity-50' : 'border-zinc-200'}`}
              >
                <input
                  type="checkbox"
                  checked={!off}
                  onChange={(e) =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.delete(l.itemId);
                      else next.add(l.itemId);
                      return next;
                    })
                  }
                  className="h-5 w-5 accent-green-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-zinc-900">{item.name}</p>
                  {list?.isRecurring && (
                    <p className="text-xs text-zinc-500">
                      {t('lists.recommended')} {l.recommended} · {t('lists.onHand')} {l.onHand}
                    </p>
                  )}
                </div>
                <input
                  value={qty[l.itemId] ?? ''}
                  onChange={(e) =>
                    setQty((p) => ({ ...p, [l.itemId]: e.target.value.replace(/[^\d.,]/g, '') }))
                  }
                  inputMode="decimal"
                  className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-center text-base"
                />
                <span className="w-8 text-xs text-zinc-400">{t(`catalog.units.${item.unit}`)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {inStockCount > 0 && (
        <button onClick={() => setShowInStock((v) => !v)} className="text-sm text-green-700 underline">
          {showInStock ? t('review.hideInStock') : t('review.showInStock', { count: inStockCount })}
        </button>
      )}

      <button
        onClick={start}
        disabled={busy}
        className="fixed inset-x-5 bottom-24 mx-auto min-h-12 max-w-md rounded-xl bg-green-600 font-bold text-white disabled:opacity-50"
      >
        {t('review.start')}
      </button>
    </main>
  );
}
