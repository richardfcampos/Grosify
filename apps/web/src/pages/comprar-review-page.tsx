import { useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../db/dexie.js';
import { previewSessionLines, startShoppingSessionWith, type SessionLine } from '../db/repositories.js';
import { Button, Icon, SectionTitle } from '../features/ui/index.js';

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
    <main className="screen-in mx-auto flex w-full max-w-md flex-col gap-4 px-[18px] py-6 pb-28">
      <button
        onClick={() => navigate({ to: '/listas/$id', params: { id } })}
        className="muted flex items-center gap-1 text-sm font-semibold"
      >
        <Icon name="back" size={17} /> {t('common.back')}
      </button>
      <SectionTitle title={t('review.title')} sub={list?.name} />

      {visible.length === 0 ? (
        <p className="muted mt-6 text-center">{t('review.empty')}</p>
      ) : (
        <div className="card row-sep" style={{ padding: 0, overflow: 'hidden' }}>
          {visible.map((l) => {
            const item = itemById.get(l.itemId);
            if (!item) return null;
            const off = excluded.has(l.itemId);
            return (
              <div
                key={l.itemId}
                className="flex items-center gap-3 px-4 py-3"
                style={{ opacity: off ? 0.5 : 1 }}
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
                  className="h-5 w-5 flex-none"
                  style={{ accentColor: 'var(--gro-green)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  {list?.isRecurring && (
                    <p className="muted mono text-xs">
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
                  className="gro-field gro-field--mono text-center"
                  style={{ padding: '6px 8px', width: '3.5rem' }}
                />
                <span className="muted w-8 text-xs">{t(`catalog.units.${item.unit}`)}</span>
              </div>
            );
          })}
        </div>
      )}

      {inStockCount > 0 && (
        <button
          onClick={() => setShowInStock((v) => !v)}
          className="text-sm underline"
          style={{ color: 'var(--gro-green)' }}
        >
          {showInStock ? t('review.hideInStock') : t('review.showInStock', { count: inStockCount })}
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" style={{ background: 'var(--app-bg)' }}>
        <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={start}>
          {t('review.start')}
        </Button>
      </div>
    </main>
  );
}
