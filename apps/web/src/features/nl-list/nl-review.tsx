import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../../db/dexie.js';
import { confirmNlReview, type NlConfirmLine } from '../../db/nl-confirm.js';
import { generateNlList, NlListError, type NlGenerateResult } from '../../lib/nl-list.js';
import { Button } from '../ui/index.js';
import { PaywallSheet } from '../billing/paywall-sheet.js';
import { NfceLineRow, type NfceReviewLine } from '../nfce/nfce-line-row.js';

/** Destino da lista gerada: nova (criação avulsa) ou existente (lista já aberta). */
export type NlReviewTarget = { kind: 'new'; name: string } | { kind: 'existing'; listId: string };

interface Props {
  prompt: string;
  target: NlReviewTarget;
  onClose: () => void;
}

/**
 * Container da revisão de lista gerada por texto: chama `generateNlList`,
 * renderiza cada linha (matcheado/novo/ignorar, qty editável — SEM preço e
 * SEM loja) e confirma via `confirmNlReview` (offline-first). `pro_required`
 * abre o paywall; array vazio mostra aviso sem criar nada.
 */
export function NlReview({ prompt, target, onClose }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<NlGenerateResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading');
    generateNlList(prompt, target.kind === 'existing' ? target.listId : undefined)
      .then((r) => {
        if (!alive) return;
        setResult(r);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof NlListError) {
          if (err.code === 'pro_required') {
            setShowPaywall(true);
            return;
          }
          setErrorCode(err.code);
        } else {
          setErrorCode('generic');
        }
        setState('error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  if (showPaywall) {
    return <PaywallSheet feature="nlList" onClose={onClose} />;
  }

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('nlList.reviewTitle')}</h2>
          <button onClick={onClose} className="muted text-sm">
            {t('common.cancel')}
          </button>
        </div>

        {state === 'loading' && <p className="muted text-sm">{t('nlList.generating')}</p>}

        {state === 'error' && (
          <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
            {t(`errors.${errorCode}`)}
          </p>
        )}

        {state === 'ready' && result && (
          <NlReviewBody result={result} target={target} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/**
 * Corpo da revisão: lista de linhas editáveis (reusa `NfceLineRow` com
 * `showPrice={false} showStore={false}` — só nome + qty importam) + confirmar.
 */
function NlReviewBody({
  result,
  target,
  onClose,
}: {
  result: NlGenerateResult;
  target: NlReviewTarget;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );
  const [busy, setBusy] = useState(false);

  // Estado inicial das linhas: pré-preenchido pelo matching do servidor + nome/qty
  // gerados. `NlGeneratedItem` já é `NfceItem`-shaped (adaptado no servidor), então
  // vira `raw` sem transformação — `NfceLineRow` esconde o preço com `showPrice={false}`.
  const [lines, setLines] = useState<NfceReviewLine[]>(() =>
    result.lines.map((line) => {
      const generated = result.items[line.lineIndex]!;
      return {
        lineIndex: line.lineIndex,
        raw: generated,
        itemId: line.itemId,
        newItemName: line.itemId ? '' : line.suggestedName,
        ignored: false,
        priceCents: 0,
        qty: generated.quantidade,
      };
    }),
  );

  const activeCount = lines.filter((l) => !l.ignored).length;
  const canConfirm = activeCount > 0 && !busy;

  function patchLine(lineIndex: number, patch: Partial<NfceReviewLine>) {
    setLines((prev) => prev.map((l) => (l.lineIndex === lineIndex ? { ...l, ...patch } : l)));
  }

  async function onConfirm() {
    setBusy(true);
    try {
      const confirmLines: NlConfirmLine[] = lines
        .filter((l) => !l.ignored)
        .map((l) => ({
          itemId: l.itemId,
          newItemName: l.newItemName || l.raw.descricao,
          unit: l.raw.unidade,
          qty: l.qty,
        }));
      await confirmNlReview({ target, lines: confirmLines });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (lines.length === 0) {
    return <p className="muted text-sm">{t('nlList.noItemsWarning')}</p>;
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto">
      <p className="muted text-xs">{t('nlList.itemsFound', { count: lines.length })}</p>
      <ul className="flex flex-col gap-2 overflow-auto" style={{ maxHeight: '60vh' }}>
        {lines.map((line) => (
          <NfceLineRow
            key={line.lineIndex}
            line={line}
            items={items}
            showPrice={false}
            showStore={false}
            onChange={(patch) => patchLine(line.lineIndex, patch)}
          />
        ))}
      </ul>

      <Button variant="primary" size="lg" fullWidth disabled={!canConfirm} onClick={onConfirm}>
        {busy ? t('nlList.confirming') : t('nlList.confirm')}
      </Button>
    </div>
  );
}
