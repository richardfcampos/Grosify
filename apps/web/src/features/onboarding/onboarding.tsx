import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { seedCommonItems } from '../catalog/seed-items.js';
import { markOnboardingDone } from '../../lib/onboarding.js';

/**
 * Primeira execução: 3 passos explicando o valor central (listas, preços, modo compra)
 * + opção de semear itens comuns. Estrutura/lógica — visual fica pro facelift.
 */
const STEPS = [
  { icon: '📋', title: 's1Title', body: 's1Body' },
  { icon: '🏷️', title: 's2Title', body: 's2Body' },
  { icon: '🛒', title: 's3Title', body: 's3Body' },
] as const;

export function Onboarding({
  householdId,
  onDone,
}: {
  householdId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step]!;

  async function finish() {
    setBusy(true);
    if (seed) {
      try {
        await seedCommonItems();
      } catch {
        // semear é best-effort — não bloqueia o onboarding
      }
    }
    markOnboardingDone(householdId);
    onDone();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="text-6xl">{s.icon}</div>
        <h1 className="text-2xl font-bold text-zinc-900">{t(`onboarding.${s.title}`)}</h1>
        <p className="max-w-xs text-zinc-600">{t(`onboarding.${s.body}`)}</p>

        <div className="mt-2 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? 'bg-green-600' : 'bg-zinc-200'}`}
            />
          ))}
        </div>

        {isLast && (
          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
            {t('onboarding.seedItems')}
          </label>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => {
            markOnboardingDone(householdId);
            onDone();
          }}
          className="text-sm font-medium text-zinc-400"
        >
          {t('onboarding.skip')}
        </button>
        <button
          onClick={() => (isLast ? void finish() : setStep((n) => n + 1))}
          disabled={busy}
          className="min-h-12 rounded-xl bg-green-600 px-6 font-semibold text-white active:bg-green-700 disabled:opacity-60"
        >
          {isLast ? t('onboarding.start') : t('onboarding.next')}
        </button>
      </div>
    </main>
  );
}
