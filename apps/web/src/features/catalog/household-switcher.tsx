import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/index.js';
import { api } from '../../lib/api.js';
import { pendingCount, syncNow } from '../../sync/engine.js';

/**
 * Seletor de casa (multi-casa). Trocar de casa zera o cache local e re-puxa a casa
 * nova (via initHousehold no AppLayout). Por isso DRENAMOS a outbox antes — senão
 * mudanças offline pendentes da casa atual se perderiam no clear.
 */
export function HouseholdSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['householdList'],
    queryFn: async () => {
      const res = await api.households.list.$get();
      if (!res.ok) throw new Error('failed');
      return res.json();
    },
  });

  const switching = useMutation({
    mutationFn: async (householdId: string) => {
      await syncNow(); // drena pendências antes do clear local
      if ((await pendingCount()) > 0) throw new Error('pending');
      const res = await api.households.switch.$post({ json: { householdId } });
      if (!res.ok) throw new Error('switch_failed');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['membership'] });
      await queryClient.invalidateQueries({ queryKey: ['householdList'] });
      navigate({ to: '/' }); // estado fresco da casa nova
    },
    onError: (e: Error) =>
      setError(e.message === 'pending' ? t('household.switchPending') : t('auth.networkError')),
  });

  const data = list.data;
  if (!data || data.households.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {data.households.map((h) => {
        const active = h.householdId === data.activeHouseholdId;
        return (
          <button
            key={h.householdId}
            type="button"
            disabled={active || switching.isPending}
            onClick={() => {
              setError(null);
              switching.mutate(h.householdId);
            }}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm"
            style={{
              background: active
                ? 'color-mix(in srgb, var(--gro-green) 12%, transparent)'
                : 'var(--app-surface-2)',
              cursor: active ? 'default' : 'pointer',
            }}
          >
            <span className="font-semibold">{h.name}</span>
            <span className="muted text-xs">{active ? t('household.active') : t('household.switch')}</span>
          </button>
        );
      })}
      {error && (
        <p className="text-sm" style={{ color: 'var(--gro-red)' }}>
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        size="md"
        fullWidth
        disabled={switching.isPending}
        onClick={async () => {
          setError(null);
          await syncNow(); // mesma proteção da troca: drena pendências antes do clear
          if ((await pendingCount()) > 0) {
            setError(t('household.switchPending'));
            return;
          }
          navigate({ to: '/casa', search: { new: '1' } });
        }}
      >
        {t('household.newHousehold')}
      </Button>
    </div>
  );
}
