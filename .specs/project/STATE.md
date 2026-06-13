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

| 2026-06-12 | Fase 1 (Catálogo): tabelas items/item_barcodes/stores com colunas sync + trigger server_version; rotas CRUD household-scoped; client gera UUIDv7; repository sobre Dexie (pull naive na carga, UI lê via useLiveQuery); scanner via pacote `barcode-detector` + manual; foto WebP 800px como blob local no Dexie | Fase 1 do plano; repository desde já evita rewrite na fase 3 |

## Bloqueios

- Deploy (Railway/Neon/CF Pages/R2) precisa de contas/credenciais do usuário — build local primeiro, deploy quando usuário fornecer

| 2026-06-12 | i18n com react-i18next: 6 idiomas (pt fallback, en, es, it, de, fr), detecção localStorage→navigator, seletor no dashboard; API retorna códigos de erro | Pedido do usuário; barato agora (5 telas), caro depois da fase 1 |
| 2026-06-12 | Multi-moeda via Intl nativo (`Intl.supportedValuesOf('currency')` + `NumberFormat`), SEM lib externa; moeda por household (`households.currency`, ISO 4217); valores em unidades mínimas da moeda (JPY=0, BHD=3 casas) | Pedido do usuário; Intl cobre listagem+formatação+casas decimais de graça |
| 2026-06-12 | Múltiplas listas de compras: `shopping_lists` (nome + `isRecurring`) + `shopping_list_entries`; substitui `recurring_list_entries`. Recorrente → ciclo inventário/needed-qty; avulsa (churrasco, festa) → qty direta. Sessão de compra referencia `listId` | Pedido do usuário (ex.: lista do mês, churrasco, aniversário) |

## TODOs / ideias adiadas

- SSE "poke" pra sync em tempo real (pós-MVP)
- Push notifications de alerta de preço (pós-MVP)
- PostGIS / busca por proximidade (YAGNI por ora)
- packages/ui compartilhado (só quando Expo existir)
- Multi-foto por item
- Conversão entre moedas (câmbio) — moeda é fixa por household; sem conversão por ora
- Upload da foto pro R2 (hoje foto é blob local-only no Dexie; não compartilha entre devices até R2)

## Preferências

- Usuário: pt-BR, terse (caveman mode). Commits convencionais, sem referência a AI.
