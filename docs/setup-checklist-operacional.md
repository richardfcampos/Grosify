# Setup — Checklist Operacional

Guia consolidado para habilitar as features de billing (Asaas), fotos Pro (R2), anti-bot (Turnstile) e import de NFC-e (Gemini, Infosimples).

---

## 1. Asaas — Pagamento (Billing)

### O que é
Plataforma de pagamento que processa assinaturas mensais do Pro via Pix ou cartão. Sem credencial: rotas `/billing` retornam 501; app funciona sem cobranças.

### Passo a passo

1. **Criar conta sandbox (teste)**
   - Acesse [sandbox.asaas.com](https://sandbox.asaas.com)
   - Cadastre-se com email da empresa

2. **Gerar API key (sandbox)**
   - No painel sandbox, vá para **Configurações → Credenciais da API**
   - Copie a chave que começa com `$aact_hmlg_` (homologação)

3. **Configurar webhook**
   - No painel, acesse **Webhooks**
   - Adicione: `https://api.grosify.com.br/webhooks/asaas`
   - Gere token de autenticação: `openssl rand -hex 24` (execute no terminal)
   - Eventos a ativar: `PAYMENT_CONFIRMED`, `RECEIVED`, `OVERDUE`, `REFUNDED`, chargebacks, `SUBSCRIPTION_DELETED`, `INACTIVATED`

4. **Variáveis de ambiente** (Railway — Pro)
   ```
   ASAAS_API_KEY=<chave sandbox $aact_hmlg_...>
   ASAAS_WEBHOOK_TOKEN=<token gerado acima>
   ASAAS_BASE_URL=https://api.sandbox.asaas.com/v3
   ```

5. **Teste de validação**
   - No painel sandbox, crie um cliente e uma cobrança
   - Pague com CPF (qualquer um funciona em sandbox)
   - Verifique se a casa torna-se Pro no app

6. **Promover para produção**
   - Crie conta produção em [asaas.com](https://asaas.com)
   - Repita passos 2–3 (API key será `$aact_...` sem `hmlg`)
   - Atualize envs no Railway:
     ```
     ASAAS_API_KEY=<chave prod>
     ASAAS_BASE_URL=https://api.asaas.com/v3
     ```

---

## 2. R2 — Fotos Pro

### O que é
Storage Cloudflare para fotos de itens e recibos (feature Pro). Sem credencial: rotas POST de foto retornam 501; fotos ficam locais apenas.

### Passo a passo

1. **Ativar R2 no Cloudflare**
   - Acesse [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Vá para **R2 → Buckets**
   - Crie bucket: `grosify-photos`

2. **Gerar token S3**
   - Em **R2 → Settings**
   - Clique **Create API Token**
   - Permissões: `Object Read & Write`
   - Copie: Account ID, Access Key ID, Secret Access Key

3. **Variáveis de ambiente** (Railway)
   ```
   R2_ACCOUNT_ID=<conta ID>
   R2_BUCKET=grosify-photos
   R2_ACCESS_KEY_ID=<chave acesso>
   R2_SECRET_ACCESS_KEY=<chave secreta>
   ```

4. **Teste**: Faça upload de foto em item Pro; URL deve ser `https://<account>.r2.cloudflarestorage.com/...`

---

## 3. Turnstile — Anti-bot (Opcional)

### O que é
Widget anti-bot Cloudflare no signup. Ativa automaticamente com Secret no backend + Site Key no frontend. **Requer rebuild do web**.

### Passo a passo

1. **Ativar no Cloudflare**
   - Dashboard → **Turnstile**
   - Crie site: `grosify-web` (ou nome seu)
   - Copie: Site Key, Secret Key

2. **Variáveis de ambiente**
   - **Railway** (backend):
     ```
     TURNSTILE_SECRET=<secret key>
     ```
   - **Build do web** (requer env var de build):
     ```
     VITE_TURNSTILE_SITE_KEY=<site key>
     ```

3. **Ativar juntos ou desativar juntos**
   - Se ambos definidos: widget ativo
   - Se um ausente: widget desativado
   - Sem ambos: signup funciona sem anti-bot

4. **Teste**: Faça signup; widget deve aparecer

---

## 4. Gemini — Embedding para Matching de NFC-e

### O que é
IA Google para embeddings de textos de itens. Otimiza matching entre itens importados de notas e seu catálogo. Sem chave: matching usa fuzzy apenas (funciona, menos preciso).

### Passo a passo

1. **Criar chave no Google AI Studio**
   - Acesse [aistudio.google.com](https://aistudio.google.com)
   - Vá para **API Keys**
   - Clique **Create API Key**
   - Copie a chave

2. **Variável de ambiente** (Railway)
   ```
   GEMINI_API_KEY=<chave>
   ```

3. **Teste**: Importe uma NFC-e; se a chave está, matching usa embedding; sem ela, usa fuzzy

---

## 5. Infosimples — Consulta de NFC-e em Sergipe

### O que é
API para consultar notas fiscais do portal de Sergipe. Custos: piso ~R$100/mês. Sem credencial: import de SE retorna "estado ainda não suportado"; RS/SP/MG funcionam grátis.

### ⚠️ DECISÃO: Ligar Sergipe ou não?

- **Sim**: Custo mensal ~R$100; toda casa pode importar de SE
- **Não**: Sergipe indisponível; apenas RS, SP, MG funcionam

### Passo a passo (se Sim)

1. **Criar conta trial**
   - Acesse [infosimples.com](https://infosimples.com)
   - Solicite conta trial (você receberá preço exato)
   - Valide se custos batem com seu orçamento

2. **Obter token**
   - No painel Infosimples, acesse credenciais
   - Copie API token

3. **Variável de ambiente** (Railway)
   ```
   INFOSIMPLES_TOKEN=<token>
   ```

4. **Teste**: Importe NFC-e de SE; se token funciona, notas aparecem

---

## 6. Validação com Cupom Real — Teste E2E

### O que é
Teste manual final: escanear NFC-e real e conferir comportamento end-to-end.

### Passo a passo

1. **Obter uma NFC-e real**
   - Faça uma compra em supermercado de RS, SP ou MG
   - Pegue o QR code (formato SEFAZ)

2. **Abrir app e importar**
   - No app, abra **Modo Compra**
   - Toque em **Importar nota (QR)**
   - Escaneie o QR code da nota

3. **Conferir tela de revisão**
   - Itens devem aparecer com nome, qtd., preço
   - Matching deve sugerir itens do seu catálogo ou "novo"
   - Preços devem estar corretos (cents)
   - CPF **nunca** deve aparecer

4. **Confirmar importação**
   - Escolha itens a importar (ignorar os que não quer)
   - Selecione loja (deve reconhecer pelo CNPJ)
   - Toque **Confirmar importação**

5. **Validar preços**
   - Vá para **Preços**
   - Procure os itens importados
   - Verifique se `source=import` aparece no histórico
   - Prices devem estar em cents (ex.: R$12,90 = 1290)

6. **Se falhar**
   - Capture o erro na tela
   - Se erro do parser: abra issue com HTML da nota para fixture
   - Se erro de API: verifique envs (Gemini, Infosimples)

---

## Quadro Resumido de Envs

| Feature | Var. Ambiente | Quando Obter | Sem Ela |
|---------|---|---|---|
| **Asaas** | `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` | Criar conta asaas.com | Billing 501 |
| **R2** | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare Dashboard | Fotos 501 |
| **Turnstile** | `TURNSTILE_SECRET` (Railway) + `VITE_TURNSTILE_SITE_KEY` (build web) | Cloudflare Turnstile | Widget off |
| **Gemini** | `GEMINI_API_KEY` | aistudio.google.com | Matching fuzzy só |
| **Infosimples** | `INFOSIMPLES_TOKEN` | infosimples.com (trial) | SE indisponível |

---

## Ordem Sugerida de Implementação

1. **Asaas** — Prioridade alta (monetização)
2. **Gemini** — Prioridade alta (melhora UX do import)
3. **Infosimples** (SE) — Prioridade média (decisão de custo)
4. **R2** — Prioridade média (feature Pro cosmética)
5. **Turnstile** — Prioridade baixa (opcional, defesa contra spam)

---

## Checklist Final

- [ ] Asaas sandbox testado (casa vira Pro)
- [ ] Asaas produção configurado (envs atualizados)
- [ ] R2 bucket criado e token gerado
- [ ] Gemini API key obtida
- [ ] Infosimples: decisão tomada (Sim/Não) e token (se Sim)
- [ ] Turnstile: decisão tomada (Sim/Não) e ambos os envs setados (se Sim)
- [ ] Teste E2E com cupom real: ✅ itens importam corretamente
- [ ] .env.example e apps/api/.env.example atualizados com placeholders
- [ ] Todo código em produção no Railway

---

## Suporte

Se encontrar erros:
- **501 em /billing**: Asaas envs faltando ou inválidos
- **501 em POST /photos**: R2 envs faltando
- **"Estado não suportado"**: Infosimples token faltando (Sergipe)
- **Matching impreciso**: Gemini key faltando
- **Parse error**: Portal SEFAZ indisponível ou formato novo (reportar)
