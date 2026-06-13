# Grosify

App de compras domésticas: lista recorrente mensal, histórico de preços por loja, inventário pré-compra e modo compra offline-first. Web PWA mobile-first agora; app Expo na fase 7.

Documentação do projeto: [`.specs/project/`](.specs/project/) (visão, roadmap, decisões).

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web** (`apps/web`): React + Vite + TanStack Router/Query + Tailwind, PWA
- **API** (`apps/api`): Hono + Drizzle + Postgres + Better Auth
- **Compartilhado**: `packages/shared` (schemas Zod + lógica de domínio), `packages/api-client` (client Hono RPC tipado)

## Desenvolvimento

```bash
pnpm install
docker compose up -d            # Postgres local na porta 5433
cp .env.example apps/api/.env
echo 'VITE_API_URL=http://localhost:3010' > apps/web/.env
pnpm --filter @grosify/api db:migrate
pnpm dev                        # API em :3010, web em :5174
```

## Comandos

```bash
pnpm typecheck   # tsc em todos os workspaces
pnpm test        # vitest
pnpm build       # build do web (PWA)
```
