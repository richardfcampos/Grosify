# Importar NFC-e por QR — Context

**Gathered:** 2026-07-05
**Spec:** `.specs/features/nfce-import/spec.md`
**Status:** Ready for design

## Feature Boundary

Consumidor escaneia o QR do cupom fiscal (NFC-e modelo 65), o servidor consulta o portal da SEFAZ da UF emissora, parseia os itens, faz o matching com o catálogo da casa (fuzzy + embedding) e o usuário revisa numa tela editável antes de confirmar → cria `price_records` (sempre) e itens novos (opt-in por linha). Import é feature Pro; Free ganha degustação de 2/mês.

**MVP = só QR.** Foto/OCR do cupom fica de fora (deferred). O scanner do app já lê `qr_code` (`use-barcode-scanner.ts:5`) — a URL da NFC-e passa no filtro atual.

## Implementation Decisions (travadas pelo usuário)

### Escopo do MVP (user escolheu "só QR")
- Entrada única: QR da NFC-e escaneado. Sem foto do cupom, sem OCR, sem digitação de chave manual (essa rota tem captcha desde 2017).
- Foto/OCR fica em Deferred Ideas.

### Gate de plano (user escolheu "degustação Free + fair-use invisível Pro")
- **Free: 2 imports/mês** (degustação — mostra o valor, cria motivo de assinar).
- **Pro: ilimitado**, com **fair-use invisível de 60/mês** — teto de segurança de custo, nunca anunciado na UI. Bater no teto Pro é caso de borda raro; erro tipado discreto, não paywall.
- Contagem por mês-calendário, por household.

### Embeddings (user escolheu "Gemini, env-gated, degrada")
- `gemini-embedding-001` truncado a 768 dims (MRL). Chave via `GEMINI_API_KEY`.
- **Sem `GEMINI_API_KEY` → matching cai pra fuzzy puro, nunca quebra.** Embedding é só desempate dos itens que o fuzzy não resolveu.
- Embeddings do catálogo (≤200 itens/casa) cacheados em coluna no banco; cosine em memória, SEM pgvector.

### Roteamento por UF (user escolheu "parsers próprios + adapter pago env-gated + erro tipado")
- **Parsers próprios**: SVRS (RS + ~13 UFs conveniadas), SP, MG — portais abertos, confirmado empiricamente hoje (HTTP 200, sem captcha, com UA de browser).
- **Sergipe via adapter Infosimples** (API paga), env-gated `INFOSIMPLES_TOKEN`. Sem token → erro `state_unsupported` ("estado ainda não suportado").
- **UF sem rota** (nem parser próprio nem adapter) → erro tipado `uf_unsupported`.
- Tabela de roteamento por UF: copiar `uri_consulta_nfce.json` do sped-nfe **pro código** (não como dependência). UF = 2 primeiros dígitos da chave (código IBGE).

### Cache/idempotência (user escolheu "cache por chave de acesso")
- Nota é imutável → **re-scan da mesma chave não re-consulta a SEFAZ**. `nfce_imports` guarda por `chave` (unique por household), serve de cache + contador de quota + idempotência.

### LGPD (user escolheu "descartar CPF, guardar itens + emitente")
- **CPF do consumidor é descartado** (nunca persistido nem logado).
- Guarda só: itens da nota + emitente (CNPJ é dado público de PJ) + chave de acesso.
- Base legal forte: o próprio consumidor pede a leitura da SUA nota; consulta é pública por desenho (Ajuste SINIEF).

### Fluxo UX (decisões dentro da margem)
- **Botão importar**: no pós-compra (componente `Summary`, `compra-page.tsx:528+`, ao lado do "anexar recibo") + entrada standalone. Encaixa aí porque a sessão já carrega loja/itens/preços pra reconciliar.
- **Scanner**: reusa `ScannerModal` (já lê QR); detectar URL de SEFAZ no caller distingue "QR de nota" de "código de produto".
- **Servidor consulta+parseia**; client mostra **tela de revisão** (itens matcheados / novos / ignorar, tudo editável).
- **Confirma** → `price_records` (sempre) + inventário. **Importar preços é sempre; criar item novo é opt-in por linha** na revisão.

### Agent's Discretion
- Shape exato de `nfce_imports` e da coluna de embedding no catálogo.
- Se a consulta+parse roda inteiramente server-side (decidido: sim — porta `NfceLookup` env-gated no servidor) ou parte no client.
- UX fina da tela de revisão (sheet vs página cheia).
- Threshold exato de cosine/fuzzscore pra auto-match vs sugestão vs item-novo.

### Declined / Undiscussed Gray Areas → Assumptions (logadas no spec)
- WebView no dispositivo do usuário pra estados com WAF/captcha (fica como evolução; MVP usa adapter pago pra SE).
- CF-e SAT de SP (modelo 59, maioria dos supermercados de SP) — fora do MVP; MVP é NFC-e modelo 65.

## Specific References
- Scanner já lê QR: `apps/web/src/features/scanner/use-barcode-scanner.ts:5,16`
- Padrão env-gate de referência: `apps/api/src/email/index.ts:20` (factory + noop), `apps/api/src/lib/turnstile.ts:10` (passthrough/fail-closed + timeout)
- Molde de rota household-scoped: `apps/api/src/routes/shopping.ts:211` (POST /prices, zValidator + onConflictDoNothing + FK→409)
- Reuso de reconciliação linha-a-linha: `apps/web/src/features/brands/unknown-barcode-sheet.tsx:24`
- Gate de plano no request: `apps/api/src/middleware/household.ts:52` (`resolveEffectivePlan` → `c.get('plan')`)

## Deferred Ideas
- Foto/OCR do cupom (entrada alternativa ao QR)
- WebView no dispositivo pra UFs com WAF/Turnstile (contorna captcha sem API paga)
- CF-e SAT modelo 59 (SP/CE varejo)
- Mais adapters pagos por UF conforme demanda; WebView fallback
- Aprender categoria de item novo via NCM (prior gratuito do próprio cupom)
