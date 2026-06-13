# Feature: Sync offline (Fase 3)

## Contexto
Compras acontecem no mercado, muitas vezes sem sinal. App precisa funcionar offline e subir os dados quando a internet voltar. Repository sobre Dexie (fases 1-2) já isola a UI — agora vira local-first.

## Abordagem (pragmática)
- **Escrita local-first**: repos escrevem no Dexie na hora (otimista) + enfileiram a operação numa **outbox**. UI reativa instantânea.
- **Engine** replica a outbox nas rotas existentes (idempotentes) quando online; remove da fila no sucesso.
- **Pull incremental** novo: `/sync/pull?cursor=N` retorna linhas com `server_version > N` de todas as tabelas sync, **incluindo tombstones** (deletes propagam). Cursor monotônico (sequence global já existe).
- **Idempotência**: id gerado no client (UUIDv7) + `ON CONFLICT (id) DO NOTHING` nos creates → replay não duplica.
- **LWW simplificado**: server é fonte de verdade no pull; "last-sync-wins" entre membros. Aceitável em escala de casa (2-4 pessoas, edições raramente colidem no mesmo item). True per-field LWW fica pra quando houver concorrência real.

## Requisitos
- SY-1: criar/editar/excluir offline → muda na UI na hora, fica pendente.
- SY-2: ao voltar online → outbox sobe automaticamente (ordem preservada).
- SY-3: pull incremental traz mudanças de outros devices/membros, incluindo deletes (tombstone).
- SY-4: merge do pull preserva foto local (blob) e não sobrescreve linha com pendência local.
- SY-5: indicador de status (offline / N pendências) na UI.
- SY-6: app shell carrega offline (Workbox precache — já via vite-plugin-pwa autoUpdate).
- SY-7: replay idempotente (reconexão após resposta perdida não duplica).

## Fora de escopo
- Modo compra / scanner-pra-marcar (fase 4).
- SSE/push em tempo real, per-field LWW com vector clock (pós-MVP).
- packages/sync storage-agnostic (fase 7, quando Expo existir).

## Critérios de aceite
- DevTools offline → criar item → aparece na lista + indicador de pendência → reconectar → sobe → pendência zera.
- Segundo browser dá pull e vê o item.
- Excluir item → some no segundo browser após pull (tombstone).
- Recarregar offline → app shell abre, dados do Dexie visíveis.
