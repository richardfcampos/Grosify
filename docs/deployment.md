# Deploy — Grosify

Initial cost ≈ US$5/month. Recommended combination:

| Part | Service | Plan |
|---|---|---|
| Database | **Neon** (Postgres) | Free → Launch |
| API | **Railway** (Dockerfile) | Hobby (~$5/month) |
| Web (PWA) | **Cloudflare Pages** | Free |
| Photos (future phase) | **Cloudflare R2** | Free 10GB |

## ⚠️ Critical: domains and session cookies

The session cookie (Better Auth) is only sent from the web to the API if they are **same-site**.

- **Recommended:** your own domain with subdomains — `grosify.app` (web) + `api.grosify.app` (API). Then `SameSite=Lax` works and is more secure. Leave `CROSS_SITE_COOKIES` off.
- **Alternative (different domains, e.g. `*.pages.dev` + `*.railway.app`):** set `CROSS_SITE_COOKIES=true` on the API (uses `SameSite=None; Secure`). It works, but requires HTTPS (already the case on these services).

## 1. Database — Neon

1. Create a project at neon.tech → copy the connection string (`postgres://...?sslmode=require`).
2. Save it as `DATABASE_URL`.

## 2. API — Railway

1. New project → Deploy from GitHub repo (this repo).
2. Railway detects `apps/api/Dockerfile` (or point it: build context = root, Dockerfile = `apps/api/Dockerfile`).
3. Environment variables:
   ```
   DATABASE_URL=<neon>
   BETTER_AUTH_SECRET=<32+ random chars>
   BETTER_AUTH_URL=https://api.grosify.app        # public API URL
   WEB_ORIGIN=https://grosify.app                 # web origin (CORS)
   NODE_ENV=production
   CROSS_SITE_COOKIES=false                        # true only if web/API are on different domains
   ```
   (Railway injects `PORT` automatically — the server reads it from `process.env.PORT`.)
4. **Migrations — automatic.** `railway.json` (repo root) defines
   `deploy.preDeployCommand: pnpm --filter @grosify/api db:migrate`. Railway runs it
   on the new image **before** switching traffic; if it fails, the deploy aborts and the old
   version stays up (no window of a missing column → 500). Nothing manual.
   - Requirement (already met): `drizzle-kit` in the image (`--prod=false` in the Dockerfile) + the
     `apps/api/drizzle/` folder copied in. `DATABASE_URL` comes from the service env.
   - Confirm in the dashboard that **Config-as-code** is enabled (Settings → the service reads
     `railway.json`). Alternative without a file: set the same command in Settings → Deploy →
     Pre-deploy Command.

## 3. Web — Cloudflare Pages

1. Pages → Connect to Git → this repo.
2. Build:
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm turbo build --filter=@grosify/web`
     (needs `turbo` to build `@grosify/ui` first — it exports `./style.css` from `dist/ui.css`; `pnpm --filter @grosify/web build` alone skips the deps and breaks with `failed to resolve "@grosify/ui/style.css"`)
   - **Output directory:** `apps/web/dist`
   - **Root directory:** `/` (monorepo root)
3. Build variable:
   ```
   VITE_API_URL=https://api.grosify.app
   ```
4. SPA routing is already covered by `apps/web/public/_redirects` (`/* /index.html 200`).

## 4. Post-deploy — checklist

- [ ] `curl https://api.grosify.app/health` → `{"ok":true}`
- [ ] Create an account on the web → create a household → confirm it persists (session cookie reaching the API)
- [ ] If login doesn't persist: check same-site/`CROSS_SITE_COOKIES` and `WEB_ORIGIN` in CORS
- [ ] Test offline (DevTools offline) → create an item → reconnect → it syncs

## Photos (R2) — only the credential is missing

The upload/download code via presigned URL **is already done** (server + client),
gated on env: without the 4 variables below the API responds `501 storage_disabled` and the app
carries on with the local blob in Dexie (without breaking). To turn it on for real:

1. **Enable R2** in the Cloudflare dashboard (R2 → Enable; 10GB free, may ask for a card).
2. **Create a bucket** `grosify-photos`.
3. **Create an S3 credential** (R2 → Manage R2 API Tokens → Create → Object Read & Write).
   Note the `access_key_id`, `secret_access_key`, and the Account ID.
4. **Set on the API** (Railway): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET=grosify-photos`. Restart.

That turns it on by itself: the sync sweep uploads local photos that don't yet have a key
(including photos taken offline, e.g. a receipt at the store) and the other members download them
on demand. The bucket is private; download URLs expire (re-presign on display).
