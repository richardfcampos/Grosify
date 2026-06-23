import { budgetStatus, estimateTotal } from '@grosify/shared';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem, type LocalSession, type LocalSessionItem } from '../db/dexie.js';
import {
  addSessionItem,
  completeSession,
  resolveBarcode,
  setSessionReceipt,
  setSessionStore,
  uncheckSessionItem,
} from '../db/repositories.js';
import { CheckItemSheet } from '../features/shopping/check-item-sheet.js';
import { UnknownBarcodeSheet } from '../features/brands/unknown-barcode-sheet.js';
import { ScannerModal } from '../features/scanner/scanner-modal.js';
import { Button, Icon, MoneyValue, Stamp, useMoneyParts } from '../features/ui/index.js';
import { resizeToWebp } from '../lib/resize-image.js';
import { useHydrateReceipt } from '../lib/use-hydrate-photo.js';
import { useObjectUrl } from '../lib/use-object-url.js';
import { useFormatMoney } from '../lib/use-currency.js';

export function CompraPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const money = useMoneyParts();
  const { id } = useParams({ from: '/app/compra/$id' });

  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const list = useLiveQuery(
    () => (session?.listId ? db.lists.get(session.listId) : undefined),
    [session?.listId],
  );
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
  const stores = useLiveQuery(
    () => db.stores.filter((s) => s.deletedAt === null).toArray(),
    [],
    [],
  );

  const [active, setActive] = useState<LocalSessionItem | null>(null);
  const [scannedBrandId, setScannedBrandId] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [hideBought, setHideBought] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
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
  const budget = budgetStatus(current, list?.budgetCents ?? null);

  // agrupa por categoria (nome desnormalizado); sem categoria vai por último
  const groups = useMemo(() => {
    const visible = hideBought ? sessionItems.filter((si) => !si.checkedAt) : sessionItems;
    const map = new Map<string, LocalSessionItem[]>();
    for (const si of visible) {
      const cat = itemById.get(si.itemId)?.category ?? '';
      const arr = map.get(cat) ?? [];
      arr.push(si);
      map.set(cat, arr);
    }
    return [...map.entries()].sort((a, b) =>
      a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0]),
    );
  }, [sessionItems, itemById, hideBought]);

  async function onScanned(barcode: string) {
    const resolved = await resolveBarcode(barcode);
    if (!resolved) {
      setUnknownCode(barcode);
      return;
    }
    openForItem(resolved.itemId, resolved.brandId);
  }

  function openForItem(itemId: string, brandId: string | null) {
    const si = sessionItems.find((s) => s.itemId === itemId);
    if (si) {
      setScannedBrandId(brandId);
      setActive(si);
    }
  }

  if (!session) return null;

  // loja ativa da sessão; sem ela, se só há 1 loja cadastrada, usa essa
  const activeStoreId = session.storeId ?? (stores.length === 1 ? stores[0]?.id ?? null : null);

  if (session.status === 'completed') {
    return (
      <Summary
        session={session}
        sessionItems={sessionItems}
        itemById={itemById}
        estimated={estimated}
        current={current}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--app-bg)', color: 'var(--app-ink)' }}>
      <header
        className="sticky top-0 z-10 flex-none px-[18px] pb-3.5 pt-3"
        style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}
      >
        <button
          onClick={() => navigate({ to: '/' })}
          className="muted mb-2 flex items-center gap-1 text-[13px]"
        >
          <Icon name="back" size={16} /> {t('shopping.back')}
        </button>
        <div className="flex items-end justify-between">
          <div>
            <div className="kicker">{t('shopping.current')}</div>
            <MoneyValue cents={current} size="md" tone={over ? 'negative' : 'positive'} {...money} />
          </div>
          <div className="text-right">
            <div className="kicker">{t('shopping.estimated')}</div>
            <div className="mono text-base">{fmt(estimated)}</div>
            {current > 0 && (
              <div
                className="mono mt-0.5 text-xs"
                style={{ color: over ? 'var(--gro-red)' : 'var(--gro-green)' }}
              >
                {over ? '▲' : '▼'} {fmt(Math.abs(estimated - current))}{' '}
                {over ? t('shopping.above') : t('shopping.below')}
              </div>
            )}
          </div>
        </div>
        {stores.length > 0 && (
          <select
            value={activeStoreId ?? ''}
            onChange={(e) => setSessionStore(id, e.target.value)}
            className="mono mt-3 min-h-11 w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              border: '1px solid var(--app-border)',
              background: 'var(--app-surface-2)',
              color: 'var(--app-ink)',
            }}
            aria-label={t('shopping.activeStore')}
          >
            <option value="" disabled>
              {t('shopping.selectActiveStore')}
            </option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {budget && list?.budgetCents != null && (
          <div className="mt-3">
            <div className="muted mono mb-1.5 flex justify-between text-[11px]">
              <span>
                {t('shopping.budget')} {fmt(list.budgetCents)}
              </span>
              <span
                style={{
                  color:
                    budget.level === 'over'
                      ? 'var(--gro-red)'
                      : budget.level === 'warn'
                        ? 'var(--gro-yellow)'
                        : 'var(--gro-green)',
                }}
              >
                {budget.pct}%
              </span>
            </div>
            <div className="bar">
              <i
                style={{
                  width: `${Math.min(budget.pct, 100)}%`,
                  background:
                    budget.level === 'over'
                      ? 'var(--gro-red)'
                      : budget.level === 'warn'
                        ? 'var(--gro-yellow)'
                        : 'var(--gro-green)',
                }}
              />
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="muted mono text-xs">
            {checkedCount}/{sessionItems.length}
          </span>
          <button
            onClick={() => setHideBought((v) => !v)}
            className="pill"
            style={{ background: 'var(--app-surface-2)', color: 'var(--app-ink)', border: 0 }}
          >
            {hideBought ? t('shopping.showBought') : t('shopping.hideBought')}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-3.5 py-2 pb-32">
        {sessionItems.length === 0 ? (
          <p className="muted mt-8 text-center">{t('shopping.emptySession')}</p>
        ) : (
          groups.map(([cat, rows]) => (
            <section key={cat} className="mt-3.5">
              <div className="kicker px-1 pb-2">{cat || t('catalog.noCategory')}</div>
              <ul className="flex flex-col gap-2">
                {rows.map((si) => {
                  const item = itemById.get(si.itemId);
                  if (!item) return null;
                  const done = !!si.checkedAt;
                  return (
                    <ShoppingRow
                      key={si.id}
                      done={done}
                      onCheck={() => setActive(si)}
                      onUncheck={() => uncheckSessionItem(si.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-base font-semibold"
                          style={{
                            textDecoration: done ? 'line-through' : 'none',
                            opacity: done ? 0.55 : 1,
                          }}
                        >
                          {item.name}
                        </div>
                        <div className="muted mono mt-0.5 text-[12.5px]">
                          {si.checkedAt && si.actualUnitPriceCents
                            ? `${si.actualQty} × ${fmt(si.actualUnitPriceCents)}`
                            : `${si.neededQty} ${t(`catalog.units.${item.unit}`)}`}
                        </div>
                      </div>
                      {done ? (
                        <span key={si.checkedAt} className="stamp-in flex-none">
                          <Stamp label={t('shopping.bought')} />
                        </span>
                      ) : (
                        <span
                          className="flex-none"
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            border: '2px solid var(--app-border)',
                          }}
                        />
                      )}
                    </ShoppingRow>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>

      <button
        className="fab"
        style={{ right: 20, bottom: 92 }}
        onClick={() => setScannerOpen(true)}
        aria-label={t('shopping.scanToCheck')}
      >
        <Icon name="scan" size={26} stroke={2} />
      </button>

      <div
        className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}
      >
        <button
          onClick={() => setQuickAdd(true)}
          aria-label={t('shopping.quickAdd')}
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full"
          style={{ background: 'var(--app-surface-2)', color: 'var(--app-ink)' }}
        >
          <Icon name="plus" size={22} />
        </button>
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={checkedCount === 0}
          onClick={async () => {
            await completeSession(id);
          }}
        >
          {t('shopping.finish')} · {fmt(current)}
        </Button>
      </div>

      {active && (
        <CheckItemSheet
          sessionItem={active}
          itemName={itemById.get(active.itemId)?.name ?? ''}
          initialBrandId={scannedBrandId}
          initialStoreId={activeStoreId}
          onStoreConfirmed={(storeId) => setSessionStore(id, storeId)}
          onClose={() => {
            setActive(null);
            setScannedBrandId(null);
          }}
        />
      )}
      {scannerOpen && <ScannerModal onDetect={onScanned} onClose={() => setScannerOpen(false)} />}
      {unknownCode && (
        <UnknownBarcodeSheet
          code={unknownCode}
          onResolved={(itemId, brandId) => {
            setUnknownCode(null);
            openForItem(itemId, brandId);
          }}
          onClose={() => setUnknownCode(null)}
        />
      )}
      {quickAdd && (
        <QuickAddSheet
          items={items}
          inSession={new Set(sessionItems.map((si) => si.itemId))}
          onPick={async (itemId) => {
            setQuickAdd(false);
            const existing = sessionItems.find((si) => si.itemId === itemId);
            if (existing) setActive(existing);
            else await addSessionItem(id, itemId);
          }}
          onClose={() => setQuickAdd(false)}
        />
      )}
    </div>
  );
}

/** Linha do modo compra com swipe: →abre marcar; ←desmarca. Tap mantém o mesmo. */
function ShoppingRow({
  done,
  onCheck,
  onUncheck,
  children,
}: {
  done: boolean;
  onCheck: () => void;
  onUncheck: () => void;
  children: ReactNode;
}) {
  const startX = useRef<number | null>(null);
  function onTouchEnd(e: TouchEvent) {
    if (startX.current === null) return;
    const dx = e.changedTouches[0]!.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 60) return; // não foi swipe
    if (dx > 0 && !done) onCheck();
    else if (dx < 0 && done) onUncheck();
  }
  return (
    <li
      className="tap card relative flex items-center gap-3"
      style={{
        minHeight: 64,
        background: done ? 'var(--app-surface-2)' : 'var(--app-surface)',
        padding: '12px 16px',
      }}
      onClick={() => (done ? onUncheck() : onCheck())}
      onTouchStart={(e) => (startX.current = e.touches[0]!.clientX)}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </li>
  );
}

/** Adiciona um item fora da lista durante a compra (busca no catálogo). */
function QuickAddSheet({
  items,
  inSession,
  onPick,
  onClose,
}: {
  items: LocalItem[];
  inSession: Set<string>;
  onPick: (itemId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...items]
      .filter((i) => !s || i.name.toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [items, q]);

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="gro-sheet-panel flex flex-col gap-2"
      >
        <div className="gro-sheet-grip" />
        <h2 className="text-lg font-bold">{t('shopping.quickAdd')}</h2>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('barcode.searchItem')}
          className="gro-field"
        />
        <ul className="flex flex-col gap-1">
          {filtered.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => onPick(i.id)}
                className="tap flex min-h-11 w-full items-center justify-between rounded-xl px-4 text-left text-sm font-medium"
                style={{ background: 'var(--app-surface-2)' }}
              >
                <span className="truncate">{i.name}</span>
                {inSession.has(i.id) && <span className="muted text-xs">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Summary({
  session,
  sessionItems,
  itemById,
  estimated,
  current,
}: {
  session: LocalSession;
  sessionItems: LocalSessionItem[];
  itemById: Map<string, LocalItem>;
  estimated: number;
  current: number;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useFormatMoney();
  const money = useMoneyParts();
  const list = useLiveQuery(
    () => (session.listId ? db.lists.get(session.listId) : undefined),
    [session.listId],
  );
  const store = useLiveQuery(
    () => (session.storeId ? db.stores.get(session.storeId) : undefined),
    [session.storeId],
  );
  const saved = estimated - current;
  const boughtItems = sessionItems.filter((si) => si.checkedAt);
  useHydrateReceipt(session.id, session.receiptKey, session.receiptBlob);
  const receiptUrl = useObjectUrl(session.receiptBlob ?? null);

  const receiptHeader = [list?.name, store?.name]
    .filter(Boolean)
    .map((s) => s!.toUpperCase())
    .join(' · ');
  const receiptDate = session.completedAt
    ? new Date(session.completedAt).toLocaleString(i18n.resolvedLanguage, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';

  async function onReceiptPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const webp = await resizeToWebp(file);
    await setSessionReceipt(session.id, webp);
  }

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
    <main
      className="screen-in flex min-h-dvh flex-col items-center gap-[18px] px-[18px] py-6"
      style={{ background: 'var(--app-bg)', color: 'var(--app-ink)' }}
    >
      {/* hero verde — economia (preço protagonista) */}
      <div
        className="card w-full overflow-hidden text-center"
        style={{ padding: 22, background: 'var(--gro-green)', color: '#fff', border: 0 }}
      >
        <div className="kicker" style={{ color: '#ffffffcc' }}>
          {saved >= 0 ? t('shopping.savedLabel') : t('shopping.overLabel')}
        </div>
        <div
          className="mt-1.5 flex justify-center"
          style={{ ['--gro-ink' as string]: '#fff' } as React.CSSProperties}
        >
          <MoneyValue cents={Math.abs(saved)} size="lg" {...money} />
        </div>
        <div className="mt-1.5 text-[13px]" style={{ color: '#ffffffcc' }}>
          {t('shopping.vsEstimated', { amount: fmt(estimated) })}
        </div>
      </div>

      {/* recibo térmico */}
      <div
        className="receipt w-full"
        style={{ maxWidth: 360, boxShadow: 'var(--app-elev)', fontFamily: 'var(--gro-font-mono)' }}
      >
        <div className="receipt-edge" />
        <div style={{ padding: '4px 22px 22px' }}>
          <div className="text-center" style={{ borderBottom: '1px dashed #00000040', paddingBottom: 12 }}>
            <div
              style={{
                fontFamily: 'var(--gro-font-ui)',
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: '-.01em',
              }}
            >
              GROSIFY
            </div>
            {receiptHeader && (
              <div style={{ fontSize: 11, color: '#57534e', marginTop: 4 }}>{receiptHeader}</div>
            )}
            {receiptDate && <div style={{ fontSize: 11, color: '#57534e' }}>{receiptDate}</div>}
          </div>
          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {boughtItems.map((si) => {
              const name = itemById.get(si.itemId)?.name ?? '';
              const lineTotal =
                si.actualQty && si.actualUnitPriceCents
                  ? Math.round(si.actualQty * si.actualUnitPriceCents)
                  : 0;
              return (
                <div key={si.id} style={{ fontSize: 12.5, color: '#1c1917' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}
                    </span>
                    <span style={{ fontWeight: 600 }}>{fmt(lineTotal)}</span>
                  </div>
                  {si.actualQty != null && si.actualUnitPriceCents != null && (
                    <div style={{ color: '#78716c', fontSize: 11 }}>
                      {si.actualQty} × {fmt(si.actualUnitPriceCents)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div
            style={{
              borderTop: '1px dashed #00000040',
              paddingTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: 15,
              color: '#1c1917',
            }}
          >
            <span>{t('shopping.receiptTotal')}</span>
            <span>{fmt(current)}</span>
          </div>
          {saved >= 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#15803d',
                marginTop: 6,
              }}
            >
              <span>{t('shopping.receiptSavings')}</span>
              <span>{fmt(saved)}</span>
            </div>
          )}
        </div>
        <div className="receipt-edge" style={{ transform: 'rotate(180deg)' }} />
      </div>

      <label className="flex cursor-pointer flex-col items-center gap-2">
        {receiptUrl ? (
          <img src={receiptUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />
        ) : (
          <span
            className="flex h-24 w-24 items-center justify-center rounded-xl text-3xl"
            style={{ border: '2px dashed var(--app-border)', color: 'var(--app-gray)' }}
          >
            🧾
          </span>
        )}
        <span className="muted text-sm">{t('shopping.attachReceipt')}</span>
        <input type="file" accept="image/*" capture="environment" onChange={onReceiptPick} className="hidden" />
      </label>

      <div className="flex w-full gap-2.5" style={{ maxWidth: 360 }}>
        <Button variant="primary" size="lg" fullWidth onClick={onShare}>
          <Icon name="share" size={18} /> {t('shopping.share')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          style={{ flex: 'none' }}
          onClick={() => navigate({ to: '/' })}
        >
          {t('shopping.toHome')}
        </Button>
      </div>
    </main>
  );
}
