# Deploy — Grosify

Custo inicial ≈ US$5/mês. Combinação recomendada:

| Parte | Serviço | Plano |
|---|---|---|
| Banco | **Neon** (Postgres) | Free → Launch |
| API | **Railway** (Dockerfile) | Hobby (~$5/mês) |
| Web (PWA) | **Cloudflare Pages** | Free |
| Fotos (fase futura) | **Cloudflare R2** | Free 10GB |

## ⚠️ Crítico: domínios e cookies de sessão

O cookie de sessão (Better Auth) só é enviado do web pra API se forem **same-site**.

- **Recomendado:** domínio próprio com subdomínios — `grosify.app` (web) + `api.grosify.app` (API). Aí `SameSite=Lax` funciona e é mais seguro. Deixe `CROSS_SITE_COOKIES` desligado.
- **Alternativa (domínios diferentes, ex. `*.pages.dev` + `*.railway.app`):** setar `CROSS_SITE_COOKIES=true` na API (usa `SameSite=None; Secure`). Funciona, mas exija HTTPS (já é o caso nesses serviços).

## 1. Banco — Neon

1. Cria projeto em neon.tech → copia a connection string (`postgres://...?sslmode=require`).
2. Guarda como `DATABASE_URL`.

## 2. API — Railway

1. Novo projeto → Deploy from GitHub repo (este repo).
2. Railway detecta `apps/api/Dockerfile` (ou aponte: build context = raiz, Dockerfile = `apps/api/Dockerfile`).
3. Variáveis de ambiente:
   ```
   DATABASE_URL=<neon>
   BETTER_AUTH_SECRET=<32+ chars aleatórios>
   BETTER_AUTH_URL=https://api.grosify.app        # URL pública da API
   WEB_ORIGIN=https://grosify.app                 # origem do web (CORS)
   NODE_ENV=production
   CROSS_SITE_COOKIES=false                        # true só se web/API em domínios diferentes
   ```
   (Railway injeta `PORT` automaticamente — o servidor lê de `process.env.PORT`.)
4. **Migrações** — rode no Release Command (ou uma vez manual):
   ```
   pnpm --filter @grosify/api db:migrate
   ```

## 3. Web — Cloudflare Pages

1. Pages → Connect to Git → este repo.
2. Build:
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @grosify/web build`
   - **Output directory:** `apps/web/dist`
   - **Root directory:** `/` (raiz do monorepo)
3. Variável de build:
   ```
   VITE_API_URL=https://api.grosify.app
   ```
4. SPA routing já coberto por `apps/web/public/_redirects` (`/* /index.html 200`).

## 4. Pós-deploy — checklist

- [ ] `curl https://api.grosify.app/health` → `{"ok":true}`
- [ ] Criar conta no web → criar casa → confirmar que persiste (cookie de sessão indo pra API)
- [ ] Se login não persistir: verificar same-site/`CROSS_SITE_COOKIES` e `WEB_ORIGIN` no CORS
- [ ] Testar offline (DevTools offline) → criar item → reconectar → sincroniza

## Fotos (R2) — quando ligar (fase futura)

Hoje fotos são blob local no Dexie (não sobem). Pra ativar upload:
1. Cria bucket R2 `grosify-photos`.
2. Variáveis na API: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. Implementar rota de presigned URL + trocar `photoBlob` local por upload no `createItem`/`updateItem`.
