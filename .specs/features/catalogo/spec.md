# Feature: Catálogo (Fase 1)

## Contexto
Base do app: itens, lojas e scanner. Toda leitura/escrita já passa por repository sobre Dexie (cache local), preparando o sync offline da fase 3 como troca de transporte, não rewrite.

## Requisitos

### Itens (CAT-1)
- CAT-1.1: criar item com nome, categoria (texto livre, datalist sugerido), unidade (un/kg/g/l/ml), foto opcional.
- CAT-1.2: item tem **múltiplos códigos de barras** (EAN-8/13); adicionar via scanner ou digitação; remover.
- CAT-1.3: editar e excluir (soft delete) item.
- CAT-1.4: listar itens da casa, busca por nome, filtro por categoria.
- CAT-1.5: foto redimensionada client-side (WebP ~800px); guardada como blob local no Dexie (upload R2 quando sync/credencial existir).
- CAT-1.6: enforcement FREE_MAX_ITEMS=30 no servidor (rejeita 31º com código `item_limit_reached`).

### Lojas (CAT-2)
- CAT-2.1: criar loja com nome, cidade, bairro (lat/lng opcional, sem mapa na fase 1).
- CAT-2.2: editar/excluir (soft delete), listar.

### Scanner (CAT-3)
- CAT-3.1: hook `useBarcodeScanner` — BarcodeDetector nativo quando há, polyfill ZXing-wasm (pacote `barcode-detector`), via getUserMedia.
- CAT-3.2: fallback sempre disponível — digitar EAN à mão; fluxo nunca trava.
- CAT-3.3: ao escanear código já cadastrado, abre o item existente em vez de duplicar.

### Dados / sync-ready (CAT-4)
- CAT-4.1: id gerado no client (UUIDv7).
- CAT-4.2: tabelas com colunas sync (updated_at, deleted_at, server_version via trigger).
- CAT-4.3: repository: gera id, escreve API, cacheia Dexie; pull naive (tudo não-deletado) na carga. UI lê do Dexie (reativo).

## Fora de escopo (fases seguintes)
- Preços, histórico, listas de compras (fase 2).
- Outbox / push-pull / LWW / offline real (fase 3).
- Upload R2 da foto (quando credenciais existirem).

## Critérios de aceite
- Criar item com 2 barcodes via scanner+manual, foto, persiste e reaparece após reload (Dexie + API).
- Escanear barcode existente abre o item.
- 31º item no plano free é rejeitado.
- CRUD de loja funciona.
- Tudo em pt-BR e mais 5 idiomas; valores e moeda respeitam a casa.
