# STATE — memória persistente

## Decisões

| Data | Decisão | Por quê |
|------|---------|---------|
| 2026-06-12 | Stack: TS monorepo pnpm+Turborepo; web Vite+React+TanStack; API Hono; Neon Postgres+Drizzle; Dexie local; Better Auth; R2 fotos; Stripe; Railway+CF Pages | Uma língua, ecossistema, código compartilhado, custo ≈$6/mês |
| 2026-06-12 | Web primeiro, UI mobile-first; Expo fase 7 | Decisão do usuário |
| 2026-06-12 | Sync: custom pull/push + LWW (UUIDv7, updated_at, deleted_at tombstone, server_version trigger) | Domínio append-only, baixa concorrência, zero serviço extra. ElectricSQL/PowerSync/Replicache descartados (ops/custo/vendor) |
| 2026-06-12 | API: Hono RPC (`hc`), não tRPC/REST puro | Já é Hono, zero dep extra, sync substitui maioria do CRUD |
| 2026-06-12 | Household no MVP; assinatura pertence ao household | Usuário fala "a gente" — uso em família |
| 2026-06-12 | Freemium: FREE_MAX_ITEMS=30, FREE_HISTORY_DAYS=90 como constantes em código; histórico = filtro de leitura, não purge | YAGNI (sem tabela plans); dados desbloqueiam no upgrade |
| 2026-06-12 | Dinheiro em centavos (integer); qty numeric(10,3); EAN como text | Sem float pra dinheiro; 1.5kg; zeros à esquerda |
| 2026-06-12 | Fotos: 1 por item (photo_key em items), WebP 800px client-side, R2 privado presigned | YAGNI multi-foto |
| 2026-06-12 | Design system "Mercado Inteligente" (DESIGN.md): Lexend+Anton+Plex Mono; verde #15803D/vermelho #DC2626/amarelo #FACC15 só em eventos de preço; modo compra sempre escuro; carimbo+recibo | Usuário aprovou com os 3 riscos; pesquisa mostrou categoria genérica pastel |

## Flags de incerteza (verificar na implementação)

1. `BarcodeDetector` no Safari iOS / câmera em PWA instalada (fase 1)
2. Pix recorrente no Stripe BR — pode forçar Mercado Pago (fase 5)
3. Limites atuais free tier Neon (fase 0 deploy)
4. Better Auth Expo plugin maturidade (fase 7)
5. Rocicorp Zero: reavaliar 1 dia antes da fase 3 se estabilizou com Expo

## Bloqueios

- Deploy (Railway/Neon/CF Pages/R2) precisa de contas/credenciais do usuário — build local primeiro, deploy quando usuário fornecer

## TODOs / ideias adiadas

- SSE "poke" pra sync em tempo real (pós-MVP)
- Push notifications de alerta de preço (pós-MVP)
- PostGIS / busca por proximidade (YAGNI por ora)
- packages/ui compartilhado (só quando Expo existir)
- Multi-foto por item

## Preferências

- Usuário: pt-BR, terse (caveman mode). Commits convencionais, sem referência a AI.
