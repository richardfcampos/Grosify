import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../../db/dexie.js';
import type { NfceRawItem } from '../../lib/nfce-import.js';
import { Icon } from '../ui/index.js';

/** Estado editável de uma linha da nota na tela de revisão (T12/T13). */
export interface NfceReviewLine {
  lineIndex: number;
  raw: NfceRawItem;
  /** Item casado (matcheado ou escolhido manualmente); null = "novo"/sem match. */
  itemId: string | null;
  /** Nome pré-preenchido pra criar item novo (editável). */
  newItemName: string;
  ignored: boolean;
  /** Preço/qtd editáveis pela revisão (pré-preenchidos pela nota). */
  priceCents: number;
  qty: number;
}

interface Props {
  line: NfceReviewLine;
  items: LocalItem[];
  onChange: (patch: Partial<NfceReviewLine>) => void;
  /** Mostra o input de preço unitário. Default true — NFC-e não muda. */
  showPrice?: boolean;
  /** Reservado pro container decidir o passo de loja (nl-list não usa). Default true. */
  showStore?: boolean;
}

/**
 * Linha editável da revisão: matcheado (nome do item + trocar), novo (nome
 * pré-preenchido editável) ou ignorado (toggle). Preço/qtd sempre editáveis
 * enquanto não ignorada. Generalizada pra nl-list via `showPrice`/`showStore`
 * (default true → comportamento do NFC-e intacto); nl-list passa false pra
 * esconder o input de preço (não registra `price_records`).
 */
export function NfceLineRow({ line, items, onChange, showPrice = true }: Props) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const matchedItem = line.itemId ? items.find((i) => i.id === line.itemId) : null;

  return (
    <li
      className="card flex flex-col gap-2"
      style={{ padding: 12, opacity: line.ignored ? 0.5 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{line.raw.descricao}</p>
          {matchedItem ? (
            <p className="mono text-[12px]" style={{ color: 'var(--gro-green)' }}>
              → {matchedItem.name}
            </p>
          ) : (
            <p className="muted text-[12px]">{t('nfce.newItem')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange({ ignored: !line.ignored })}
          aria-label={t('nfce.ignore')}
          className="flex-none rounded-lg p-1.5"
          style={{
            background: line.ignored ? 'var(--app-surface-2)' : 'transparent',
            color: line.ignored ? 'var(--gro-red)' : 'var(--app-gray)',
          }}
        >
          <Icon name="minus" size={16} />
        </button>
      </div>

      {!line.ignored && (
        <>
          {matchedItem ? (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="self-start text-[12px] underline"
              style={{ color: 'var(--gro-green)' }}
            >
              {t('nfce.changeMatch')}
            </button>
          ) : (
            <input
              value={line.newItemName}
              onChange={(e) => onChange({ newItemName: e.target.value })}
              placeholder={t('catalog.itemName')}
              maxLength={200}
              className="gro-field"
              style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }}
            />
          )}

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-0.5">
              <span className="kicker">{t('nfce.qty')}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                value={line.qty}
                onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })}
                className="gro-field mono"
                style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }}
              />
            </label>
            {showPrice && (
              <label className="flex flex-1 flex-col gap-0.5">
                <span className="kicker">{t('nfce.unitPrice')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={(line.priceCents / 100).toFixed(2)}
                  onChange={(e) => onChange({ priceCents: Math.round(Number(e.target.value) * 100) || 0 })}
                  className="gro-field mono"
                  style={{ minHeight: 40, padding: '8px 12px', fontSize: 13 }}
                />
              </label>
            )}
          </div>
        </>
      )}

      {picking && (
        <ItemPickerSheet
          items={items}
          onPick={(itemId) => {
            onChange({ itemId, newItemName: '' });
            setPicking(false);
          }}
          onCreateNew={() => {
            onChange({ itemId: null, newItemName: line.raw.descricao });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </li>
  );
}

/** Folha simples de troca de item (busca no catálogo local ou volta a "criar novo"). */
function ItemPickerSheet({
  items,
  onPick,
  onCreateNew,
  onClose,
}: {
  items: LocalItem[];
  onPick: (itemId: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const liveItems = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    items,
  );
  const filtered = liveItems
    .filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 20);

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-2">
        <div className="gro-sheet-grip" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('barcode.searchItem')}
          className="gro-field"
        />
        <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
          {filtered.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onPick(i.id)}
                className="tap min-h-11 w-full rounded-xl px-4 text-left text-sm font-medium"
                style={{ background: 'var(--app-surface-2)' }}
              >
                {i.name}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCreateNew}
          className="tap min-h-11 rounded-xl px-4 text-left text-sm font-semibold"
          style={{ background: 'var(--app-surface-2)', color: 'var(--gro-green)' }}
        >
          {t('nfce.createInline')}
        </button>
      </div>
    </div>
  );
}
