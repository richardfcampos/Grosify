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

| 2026-06-13 | Fase 2 (Preços+Listas): tabelas price_records/shopping_lists/shopping_list_entries/inventory_counts + triggers; rotas com upsert (entry por lista+item, inventário por casa+item); telas listas múltiplas (recorrente/avulsa), detalhe com qty inline + total estimado, PrecoSheet (registrar/histórico/loja mais barata/alerta aumento), inventário com needed-qty; moeda da casa formatada por locale | Fase 2 do plano; domínio shared (cheapestStore/priceChange/neededQty/estimateTotal) reusado client+server |

| 2026-06-13 | Fase 3 (Sync offline): outbox no Dexie (replay HTTP das rotas existentes, idempotentes via ON CONFLICT DO NOTHING); pull incremental `/sync/pull?cursor=N` com tombstones; engine com gatilhos online/focus/30s; repos viraram local-first (escrita otimista + enqueue); status UI offline/pendências | Fase 3. Desvios do plano original (honestos): (a) reuso rotas REST em vez de /sync/push genérico — menos código novo, transporte trocado; (b) sem tabela `clients` (idempotência via id+upsert); (c) LWW vira "last-sync-wins" (server seta updatedAt) — aceitável p/ casa 2-4 pessoas; (d) `packages/sync` adiado pro Expo (fase 7) — engine fica no web |

| 2026-06-13 | Fase 4 (Modo Compra — MVP): tabelas shopping_sessions/items + triggers; rotas criar sessão (snapshot needed-qty + estimativa), atualizar item/sessão; tela escura fullscreen (carimbo COMPRADO, total corrente vs estimado verde/vermelho, scan-pra-marcar, tem-mais-barato), resumo com economia; tudo offline-first | Fase 4, lançamento MVP. Bug corrigido: CORS não permitia PATCH (todos os updates falhavam no browser) |

| 2026-06-13 | Fase 6 (Polish+LGPD): rota /me (export JSON + excluir conta/casa cascade); tela Ajustes (idioma, export, excluir, sair); seed de 20 itens comuns pt-BR na tela vazia. **Fix de segurança**: Dexie vazava dados entre contas no mesmo browser — `initHousehold` limpa cache local quando muda de casa; logout também limpa | Fase 6. Pulei a 5 (billing) por precisar de credenciais Stripe |

| 2026-06-13 | Reposição automática: `items.monthlyTarget` (quantidade recomendada/mês); HOME virou painel de reposição (lista o que falta = max(alvo−estoque,0), total estimado, "iniciar compra" cria sessão de reposição); inventário ganhou scanner (escanear código → quick-set de quantidade); convite movido pra Ajustes | Pedido do usuário: queixou que quantidades recomendadas estavam escondidas e faltava tela que gera lista de reposição |

## Limitações conhecidas (fase 6)
- Logout com mutações pendentes na outbox perde os não-sincronizados (clearLocalData zera a fila). Avisar/forçar sync antes do logout no futuro.
- Privacy policy é só endpoint de dados; falta o TEXTO da política (página estática) pra lançamento.

## Limitações conhecidas (fase 3)
- Sessão/membership exigem API online: navegação com page-load fresca offline cai no login. Uso real (já logado, fica offline mid-sessão via SPA nav) funciona — verificado. App shell offline via Workbox precache (build gera SW; testar em prod build).
- Edição concorrente do MESMO item por 2 membros offline: last-sync-wins (sem per-field LWW). Raro em escala de casa.
- Mutação rejeitada com resposta recebida (ex. item_limit) é removida da outbox mas a linha otimista local permanece — reconciliar no futuro.

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
