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
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm turbo build --filter=@grosify/web`
     (precisa do `turbo` pra buildar `@grosify/ui` antes — ele exporta `./style.css` de `dist/ui.css`; `pnpm --filter @grosify/web build` sozinho pula as deps e quebra com `failed to resolve "@grosify/ui/style.css"`)
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

## Fotos (R2) — só falta a credencial

O código de upload/download via presigned URL **já está pronto** (servidor + client),
gated em env: sem as 4 variáveis abaixo a API responde `501 storage_disabled` e o app
segue com o blob local no Dexie (sem quebrar). Pra ligar de verdade:

1. **Ativar R2** no dashboard Cloudflare (R2 → Enable; 10GB grátis, pode pedir cartão).
2. **Criar bucket** `grosify-photos`.
3. **Criar credencial S3** (R2 → Manage R2 API Tokens → Create → Object Read & Write).
   Anota `access_key_id`, `secret_access_key` e o Account ID.
4. **Setar na API** (Railway): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET=grosify-photos`. Reinicia.

Com isso liga sozinho: o sweep do sync sobe fotos locais que ainda não têm key
(inclui fotos tiradas offline, ex.: recibo no mercado) e os outros membros baixam
sob demanda. Bucket é privado; URLs de download expiram (re-presign no display).
