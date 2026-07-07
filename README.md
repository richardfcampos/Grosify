# Grosify

Household grocery shopping app: monthly recurring list, per-store price history, pre-shopping inventory, and an offline-first shopping mode. Mobile-first web PWA for now; Expo app in phase 7.

Project documentation: [`.specs/project/`](.specs/project/) (vision, roadmap, decisions).

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web** (`apps/web`): React + Vite + TanStack Router/Query + Tailwind, PWA
- **API** (`apps/api`): Hono + Drizzle + Postgres + Better Auth
- **Shared**: `packages/shared` (Zod schemas + domain logic), `packages/api-client` (typed Hono RPC client)

## Development

```bash
pnpm install
docker compose up -d            # Local Postgres on port 5433
cp .env.example apps/api/.env
echo 'VITE_API_URL=http://localhost:3010' > apps/web/.env
pnpm --filter @grosify/api db:migrate
pnpm dev                        # API on :3010, web on :5174
```

## Commands

```bash
pnpm typecheck   # tsc across all workspaces
pnpm test        # vitest
pnpm build       # web build (PWA)
```
