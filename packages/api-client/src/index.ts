import { hc } from 'hono/client';
import type { AppType } from '@grosify/api/client-types';

export type ApiClient = ReturnType<typeof hc<AppType>>;

/** Client tipado da API. Cookies de sessão incluídos por padrão. */
export function createApiClient(baseUrl: string): ApiClient {
  return hc<AppType>(baseUrl, {
    init: { credentials: 'include' },
  });
}
