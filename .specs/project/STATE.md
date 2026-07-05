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
- ~~Falta o TEXTO da política~~ → feito: `privacidade-page.tsx` (rota `/privacidade`), texto pt-BR (mercado primário, não i18n por ora).

## Limitações conhecidas (fase 3)
- Sessão/membership exigem API online: navegação com page-load fresca offline cai no login. Uso real (já logado, fica offline mid-sessão via SPA nav) funciona — verificado. App shell offline via Workbox precache (build gera SW; testar em prod build).
- Edição concorrente do MESMO item por 2 membros offline: last-sync-wins (sem per-field LWW). Raro em escala de casa.
- Mutação rejeitada com resposta recebida (ex. item_limit) é removida da outbox mas a linha otimista local permanece — reconciliar no futuro.

| 2026-06-13 | Billing: provedor = **Mercado Pago** (verificado por web search — suporta cartão recorrente E Pix Automático, recorrente via Pix no ar desde jun/2025). Scaffold sem provedor pronto: filtro histórico 90d no free (client-side via historyCutoff), seção de plano + CTA "Seja Pro" (desabilitado até MP) em Ajustes | Usuário perguntou se MP aceita ambos — sim. Recomendado MP por cobrir Pix recorrente (melhor pro BR) |

| 2026-06-13 | Autocomplete de loja via **Photon** (komoot/OpenStreetMap, grátis, sem chave): campo único busca estabelecimento por nome/bairro/cidade, preenche nome/cidade/bairro + lat/lng. Debounce 350ms, atribuição OSM. Campos seguem editáveis (POI pequeno pode faltar no OSM) | Pedido do usuário; Photon escolhido por ter autocomplete real (Nominatim não tem) e ser grátis sem chave |

| 2026-06-16 | Recomendado é por (lista, item), NÃO por item: removido `items.monthlyTarget` (migração drop). A qty da entrada de lista recorrente (`shopping_list_entries.qty`) é a recomendação — duas listas podem ter o mesmo item com qtys diferentes. Home virou reposição POR lista recorrente (card: faltam X, total, iniciar compra via startShoppingSession). Inventário calcula needed pela soma das entradas de listas recorrentes. Removido startReplenishmentSession | Correção pedida pelo usuário: monthlyTarget no item era modelagem errada |

## Bloqueios

- **Deploy**: configs prontas (Dockerfile, _redirects, docs/deployment.md). Usuário vai executar seguindo a doc (criar Neon+Railway+CF Pages). Eu de plantão.
- **Billing Mercado Pago**: integração (checkout/preapproval/webhooks) aguarda credenciais MP do usuário (access token + public key).
- **Fotos R2**: código pronto (env-gated, 501 quando off). Aguarda usuário ativar R2 + criar credencial S3 no dashboard Cloudflare (MCP não ativa R2 nem cria token — gate de conta). Passos em `docs/deployment.md`.

| 2026-06-12 | i18n com react-i18next: 6 idiomas (pt fallback, en, es, it, de, fr), detecção localStorage→navigator, seletor no dashboard; API retorna códigos de erro | Pedido do usuário; barato agora (5 telas), caro depois da fase 1 |
| 2026-06-12 | Multi-moeda via Intl nativo (`Intl.supportedValuesOf('currency')` + `NumberFormat`), SEM lib externa; moeda por household (`households.currency`, ISO 4217); valores em unidades mínimas da moeda (JPY=0, BHD=3 casas) | Pedido do usuário; Intl cobre listagem+formatação+casas decimais de graça |
| 2026-06-12 | Múltiplas listas de compras: `shopping_lists` (nome + `isRecurring`) + `shopping_list_entries`; substitui `recurring_list_entries`. Recorrente → ciclo inventário/needed-qty; avulsa (churrasco, festa) → qty direta. Sessão de compra referencia `listId` | Pedido do usuário (ex.: lista do mês, churrasco, aniversário) |

| 2026-06-22 | Facelift v2 — port visual completo (decisão: IA exata do protótipo, desktop+mobile). Shell responsivo: **rail lateral no desktop** (logo/nav Início·Preços·Comprar·Estoque·Ajustes·casa·plano) + bottom nav no mobile — antes era mobile-only sem rail (causa do "totalmente diferente"); bug `.botnav` vazando no desktop corrigido. Telas portadas pro design system: Início (stats hero), Preços (itens, "mais barato em {loja}"), Estoque (kicker+Novo item), **Ajustes virou hub** (era zinc antigo), Categorias, Atividades, Onboarding, household-pages, Privacidade + sub-componentes (brands/comments/barcode-chooser/category-picker/star-rating). Scanner modals ficam dark (câmera). Verificado no browser (desktop+mobile) via conta QA. Badges de estoque mantidos **neutros** (DESIGN.md: cor só em dinheiro; protótipo usa colorido — decisão pendente do usuário) | Pedido do usuário: "app inteiro igual ao novo design". Plano em `plans/grosify-prototype-port/facelift-v2.md`. Commits 4bf7d51/e50fe15/88fc287/d53b392 |
| 2026-06-22 | Port do protótipo — fonte completa salva e reskin dos sheets pendentes. (a) Mirror git-tracked `plans/grosify-prototype-port/reference/` completado com a fonte completa do protótipo (screens1-4, entry, print, ui, data) que faltava — antes só tinha app.jsx/icons.jsx/theme.js; design system do export é byte-idêntico ao repo (`packages/ui`/`ds-bundle`), nada a re-portar nos componentes. (b) Fase 7: 4 sheets migrados de stone/zinc hardcoded → tokens do DS (`.gro-sheet-*`/`.gro-field`/`Button`, herdando o cascade): CheckItemSheet, QuickAddSheet, UnknownBarcodeSheet, BrandPicker (perdeu prop `dark`). Bug visual corrigido: UnknownBarcodeSheet renderizava branco dentro do Modo Compra escuro. CheckItemSheet confirmar agora `Button` primary verde (referência), não amarelo. Typecheck+build verdes | Pedido do usuário ("aplicar a nova cara e salvar no lugar certo"). Pendente: sweep i18n final, PreçoDetail tabela-lojas, QA visual ao vivo dos sheets |
| 2026-06-20 | Fotos R2 reais (código pronto, gated em env): presign via `aws4fetch` (não aws-sdk), rota `/uploads` household-scoped (key montada do `householdId` da sessão, viewer não sobe), client `lib/uploads.ts` + sweep no engine (sobe blob local sem key no sync; cobre foto offline tipo recibo) + `hydratePhoto` baixa sob demanda pra membro sem blob. Sem `R2_*` no env → 501 → cai no blob local. **Só falta a credencial** (ativar R2 + token S3 no dashboard — MCP da Cloudflare não ativa R2 nem cria token: gate de conta). Onboarding (first-run, 3 passos + seed opcional, flag localStorage por household) — estrutura; visual no facelift | Escopo travado pelo usuário: privacidade (já existia), onboarding, fotos R2. Provei via MCP que R2 não está ativado (10042) e o token não cria credencial (9109) — premissa "destrava via MCP" corrigida pra "código pronto, espera credencial" |
| 2026-07-05 | Idioma da UI persiste **por conta** no banco (`user.ui_locale`, migração 0025), NÃO por casa — segue a pessoa em qualquer aparelho/casa. Rota `/settings` aceita `locale` (enum 6 idiomas) e grava no `user`; `membershipOf` retorna `locale`; AppLayout aplica `i18n.changeLanguage` 1x/sessão no load; localStorage segue como cache instantâneo (sem flash no boot). Contraste: **tema** continua por membership (`householdMembers.uiThemeMode/uiThemeDir`) — pode variar por casa | Usuário percebeu que idioma só ficava em localStorage (por aparelho) e queria no banco. Escolhido por conta (não por casa) porque idioma é preferência da pessoa; tema fica por casa. Espelha o padrão app-managed de `user.activeHouseholdId` (Better Auth ignora colunas que não conhece) |
| 2026-07-04 | Troca de casa (multi-household) instantânea: `initHousehold` dispara `syncNow()` no ramo `changed && started` (antes só re-puxava no tick de 30s, pois `startSync` é idempotente) + `<Outlet key={householdId}>` no AppLayout remonta a subárvore roteada (senão os `useLiveQuery` montados ficavam presos à casa antiga, exigindo refresh manual). Atalho: logo+nome da Home abre sheet com `HouseholdSwitcher` (antes só em Ajustes) | Usuário reportou lentidão + necessidade de refresh ao trocar de casa, e quis trocar pela logo. PRs #15/#16/#17. Teste de regressão em `engine-switch.test.ts` |
| 2026-07-05 | Billing = **Asaas** (BR, live env-gated) + **Stripe** (stub 501, internacional futuro) via porta `PaymentProvider` — SUPERSEDE decisão 2026-06-13 "Billing: provedor = Mercado Pago"; gates free reativados (30 itens / 2 listas / 2 membros / 90d history) vs Pro R$12,90/mês ou R$99/ano; downgrade = filtro de leitura + banner de dados ocultos; comp/100% via `households.planOverride`; CPF coletado no checkout sem persistir; Pix Automático fora do MVP (exige PJ 6+ meses) | Decisão do usuário na feature pro-plan-billing (spec/design/tasks em `.specs/features/pro-plan-billing/`) |
| 2026-06-18 | Programa "grocify-parity" (10 fases): scanner QR/lanterna/OFF; sync observável; alerta de preço 10%/média 90d; item notas/marca preferida/conversão de unidades; listas ícone/cor/recorrência + preferências de exibição; **categorias como entidade** (migração texto→tabela); modo compra (repõe estoque, agrupa, quick-add, swipe, orçamento); inventário com **ledger de movimentos** (mínimo/low-stock/consumo/ajuste/contagem); **orçamento por lista** + **analytics Recharts** + foto recibo + rating; revisão de compra + badge "dia de comprar" + histórico; **colaboração** (papéis owner/admin/member/viewer + viewer read-only, membros, feed de atividades, comentários sincronizados, atribuição, **SSE poke**); busca avançada (marca/categoria/filtros/recentes/salvos) + export CSV/PDF(print) + restore. Migrações 0012–0017 | Pedido do usuário: paridade com features do plano do "Grocify" (itens 1,2,3,5,6,7,8,9,10 + gaps menores). Decisões: SSE poke (não WebSocket), Recharts, categorias entidade completa, OpenFoodFacts com fallback. Push notifications ficaram fora |

## TODOs / ideias adiadas

- SSE "poke" pra sync em tempo real (pós-MVP)
- Push notifications de alerta de preço (pós-MVP)
- PostGIS / busca por proximidade (YAGNI por ora)
- packages/ui compartilhado (só quando Expo existir)
- Multi-foto por item
- Conversão entre moedas (câmbio) — moeda é fixa por household; sem conversão por ora
- ~~Upload da foto pro R2~~ → código pronto (env-gated); só falta a credencial R2 (ver deployment.md)

## Preferências

- Usuário: pt-BR, terse (caveman mode). Commits convencionais, sem referência a AI.
