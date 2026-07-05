import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

export interface Membership {
  householdId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  name: string;
  plan: 'free' | 'pro';
  currency: string;
  /** Se o membro já viu o onboarding (persistido na conta). */
  onboarded: boolean;
  /** Preferências visuais salvas na conta (null = nunca setou; client valida). */
  themeMode: string | null;
  themeDir: string | null;
  /** Idioma da UI salvo na conta (null = nunca setou; cai na detecção do navegador). */
  locale: string | null;
}

export function useMembership(enabled: boolean) {
  return useQuery({
    queryKey: ['membership'],
    enabled,
    queryFn: async (): Promise<Membership | null> => {
      const res = await api.households.mine.$get();
      if (!res.ok) throw new Error('falha ao carregar casa');
      const data = await res.json();
      return data.membership;
    },
  });
}
