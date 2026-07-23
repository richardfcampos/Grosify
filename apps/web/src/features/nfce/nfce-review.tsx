import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type LocalItem } from '../../db/dexie.js';
import { confirmNfceReview } from '../../db/nfce-confirm.js';
import {
  confirmNfce,
  lookupNfce,
  NfceImportError,
  type NfceLookupResult,
} from '../../lib/nfce-import.js';
import { Button } from '../ui/index.js';
import { PaywallSheet } from '../billing/paywall-sheet.js';
import { NfceLineRow, type NfceReviewLine } from './nfce-line-row.js';
import { NfceStoreStep } from './nfce-store-step.js';

interface Props {
  qrUrl: string;
  onClose: () => void;
}

/**
 * Tela de revisão do import de NFC-e: escaneou → consulta o lookup → revisa
 * itens matcheados/novos/ignorados + loja → confirma (grava via repositórios
 * Dexie + outbox em `confirmNfceReview`, offline-first).
 */
export function NfceReview({ qrUrl, onClose }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'processing' | 'ready' | 'error'>('loading');
  const [result, setResult] = useState<NfceLookupResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    // O portal (Infosimples) faz cold scraping >70s em background; damos ~3,5min de
    // polling (a cada 8s) antes de desistir.
    const POLL_MS = 8_000;
    const MAX_WAIT_MS = 210_000;

    async function attempt(isFirst: boolean) {
      try {
        // retry só no 1º disparo (scan do usuário): re-tenta uma nota que falhou antes.
        const outcome = await lookupNfce(qrUrl, { retry: isFirst });
        if (!alive) return;
        if (outcome.status === 'ready') {
          setResult(outcome.result);
          setState('ready');
          return;
        }
        // Ainda processando no portal → segue no polling até o teto.
        if (Date.now() - startedAt > MAX_WAIT_MS) {
          setErrorCode('nfce_timeout');
          setState('error');
          return;
        }
        setState('processing');
        timer = setTimeout(() => void attempt(false), POLL_MS);
      } catch (err: unknown) {
        if (!alive) return;
        if (err instanceof NfceImportError) {
          if (err.code === 'nfce_quota_free') {
            setShowPaywall(true);
            return;
          }
          setErrorCode(err.code);
        } else {
          setErrorCode('generic');
        }
        setState('error');
      }
    }

    setState('loading');
    void attempt(true);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrUrl]);

  if (showPaywall) {
    return <PaywallSheet feature="nfce" onClose={onClose} />;
  }

  return (
    <div className="gro-sheet-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="gro-sheet-panel flex flex-col gap-3">
        <div className="gro-sheet-grip" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('nfce.reviewTitle')}</h2>
          <button onClick={onClose} className="muted text-sm">
            {t('common.cancel')}
          </button>
        </div>

        {state === 'loading' && <p className="muted text-sm">{t('nfce.loading')}</p>}
        {state === 'processing' && <p className="muted text-sm">{t('nfce.processing')}</p>}

        {state === 'error' && (
          <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
            {t(`errors.${errorCode}`)}
          </p>
        )}

        {state === 'ready' && result && (
          <NfceReviewBody result={result} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/** Resolução do passo de loja: existente por CNPJ (storeId) ou nova a criar (createName). */
interface StoreResolution {
  storeId: string | null;
  createName: string | null;
}

/** Corpo da revisão: lista de linhas editáveis + passo de loja + confirmar. */
function NfceReviewBody({ result, onClose }: { result: NfceLookupResult; onClose: () => void }) {
  const { t } = useTranslation();
  const items = useLiveQuery(
    () => db.items.filter((i) => i.deletedAt === null).toArray(),
    [],
    [] as LocalItem[],
  );
  const [busy, setBusy] = useState(false);
  const [store, setStore] = useState<StoreResolution>({ storeId: null, createName: null });

  // Estado inicial das linhas: pré-preenchido pelo matching do servidor + valores da nota.
  const [lines, setLines] = useState<NfceReviewLine[]>(() =>
    result.lines.map((line) => {
      const raw = result.itens[line.lineIndex]!;
      return {
        lineIndex: line.lineIndex,
        raw,
        itemId: line.itemId,
        newItemName: line.itemId ? '' : line.suggestedName,
        ignored: false,
        priceCents: raw.valorUnitCents,
        qty: raw.quantidade,
      };
    }),
  );

  const activeCount = useMemo(() => lines.filter((l) => !l.ignored).length, [lines]);
  const canConfirm =
    activeCount > 0 &&
    (store.storeId !== null || (store.createName?.trim().length ?? 0) > 0) &&
    !busy;

  function patchLine(lineIndex: number, patch: Partial<NfceReviewLine>) {
    setLines((prev) => prev.map((l) => (l.lineIndex === lineIndex ? { ...l, ...patch } : l)));
  }

  async function onConfirm() {
    setBusy(true);
    try {
      await confirmNfceReview({
        chave: result.chave,
        emitente: result.emitente,
        store,
        lines: lines.filter((l) => !l.ignored),
      });
      await confirmNfce(result.chave); // best-effort — status server-side
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (result.alreadyImported) {
    return <p className="muted text-sm">{t('nfce.alreadyImported')}</p>;
  }

  return (
    <div className="flex flex-col gap-3 overflow-auto">
      <NfceStoreStep emitente={result.emitente} onResolved={setStore} />

      <p className="muted text-xs">{t('nfce.itemsFound', { count: lines.length })}</p>
      <ul className="flex flex-col gap-2 overflow-auto" style={{ maxHeight: '50vh' }}>
        {lines.map((line) => (
          <NfceLineRow
            key={line.lineIndex}
            line={line}
            items={items}
            onChange={(patch) => patchLine(line.lineIndex, patch)}
          />
        ))}
      </ul>

      <Button variant="primary" size="lg" fullWidth disabled={!canConfirm} onClick={onConfirm}>
        {busy ? t('nfce.confirming') : t('nfce.confirm')}
      </Button>
    </div>
  );
}
