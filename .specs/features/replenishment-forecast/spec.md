# Previsão de reposição (`replenishment-forecast`)

**Status:** implementada · **Plano:** Pro-only (sem degustação) · **Escopo:** 100% client-side (Dexie) + função de domínio pura no shared.

## Problema

O usuário sabe *quanto* tem em casa (estoque), mas não *quando vai acabar*. "Arroz acaba em ~5 dias" é a pergunta que o app ainda não responde. A partir do consumo histórico local (ledger de `stock_movements`), dá pra estimar a taxa diária de consumo por item e projetar quantos dias faltam pro estoque zerar — mostrando isso onde o usuário decide reposição: Home (cards de lista) e página de Estoque.

## Heurística (cravada)

Fonte de dados: movimentos de estoque do tipo `consumption` (o ledger já registra cada baixa real do estoque como movimento com `qty` negativo — sinal mais limpo e direto do consumo; compras entram como `purchase` e recontagens como `count`/`adjustment`, que **não** contam como consumo).

- **Janela:** 60 dias corridos a partir de "agora" (`now`). Escolha: capta sazonalidade curta do mês doméstico sem diluir demais num item de giro lento.
- **Consumido na janela:** soma de `-qty` de todos os movimentos `consumption` com `movedAt` dentro da janela (`qty` de consumo é sempre ≤ 0).
- **Taxa diária** = `consumido / 60` (divide pela janela inteira em dias, não por "dias com dados" — assim item que só consumiu 1x em 60d tem taxa baixa, refletindo giro lento).
- **daysLeft** = `floor(qtyOnHand / taxa)`.
- **Sem previsão (retorna `null`, nunca `0`)** quando qualquer uma:
  - menos de **2** eventos de consumo na janela (dados insuficientes — item novo/esporádico);
  - `qtyOnHand <= 0` (já zerou — não há o que projetar, o status "zerado" já cobre);
  - taxa `<= 0` (nenhum consumo → não acaba).

Funções puras no shared (`@grosify/shared`): `dailyConsumptionRate(events, windowDays, now)` e `daysUntilOut(qtyOnHand, rate)`.

## Stories

### S1 — Ver dias até acabar por item (Home + Estoque) · Pro

**Como** membro Pro, **quero** ver "acaba em ~Nd" nos itens **para** repor antes de faltar.

- **AC1** — WHEN um item tem ≥2 movimentos de consumo nos últimos 60d, `qtyOnHand > 0` e taxa > 0, THEN `daysUntilOut` retorna `floor(qtyOnHand / taxaDiária)` (inteiro ≥ 0).
- **AC2** — WHEN o item tem <2 eventos de consumo na janela, THEN a previsão é `null` (badge não aparece).
- **AC3** — WHEN `qtyOnHand <= 0`, THEN a previsão é `null` (o estado "zerado" já é sinalizado por outro caminho).
- **AC4** — WHEN a taxa de consumo é 0 (sem consumo na janela) OU `<= 0`, THEN a previsão é `null`.
- **AC5** — WHEN existem consumos fora da janela de 60d, THEN eles são ignorados no cálculo da taxa.
- **AC6** — WHEN há consumo suficiente, THEN na Home o card da lista mostra o item **mais crítico** (menor `daysLeft`) como badge neutro "acaba em ~Nd"; na página de Estoque cada linha com previsão mostra o mesmo badge.

### S2 — Free vê teaser, não o número · gate

**Como** membro free, **quero** entender que existe previsão de reposição no Pro **para** decidir assinar.

- **AC1** — WHEN o plano é `free`, THEN nenhum badge de previsão é computado nem exibido (privacidade de custo/UX: não vaza o número).
- **AC2** — WHEN o plano é `free`, THEN um teaser discreto (um chip/linha "Previsão de reposição — Pro") aparece na Home e no Estoque; ao tocar, abre `PaywallSheet('forecast')`.
- **AC3** — WHEN o plano é `pro`, THEN o teaser não aparece (só os badges reais).

### S3 — Função de domínio pura e testável

**Como** dev, **quero** a heurística isolada em funções puras **para** testar 1:1 com os ACs e reusar client-side.

- **AC1** — `dailyConsumptionRate` só soma eventos `consumption` dentro da janela; ignora `purchase`/`adjustment`/`count` e eventos fora da janela.
- **AC2** — `dailyConsumptionRate` retorna `null` com <2 eventos de consumo na janela; caso contrário `consumido/windowDays`.
- **AC3** — `daysUntilOut(qtyOnHand, rate)` retorna `null` se `rate == null`, `rate <= 0` ou `qtyOnHand <= 0`; senão `floor(qtyOnHand/rate)`.

## Edge cases

| Caso | Resultado |
|------|-----------|
| Item recém-criado (0 movimentos) | `null` (S1/AC2, S3/AC2) |
| Consumo esporádico (1 evento em 60d) | `null` (mínimo de 2) |
| Estoque zerado (`qtyOnHand<=0`) | `null` (S1/AC3) |
| Taxa zero (só compras/contagens) | `null` (S1/AC4) |
| Consumo alto + estoque baixo | `daysLeft` pequeno → badge "acaba em ~1d"/"~0d" |
| Consumos antigos (>60d) | ignorados; se sobram <2 recentes → `null` |
| `daysLeft` exatamente no limite | `floor` → truncado pra baixo (conservador) |

## Out of scope

- Previsão por ML/regressão (heurística simples primeiro — decisão do dono).
- Notificações push / lembretes de reposição.
- Diferenciar taxa por marca ou por loja.
- Adicionar automaticamente o item à lista quando `daysLeft` baixo.
- Degustação da feature pro free (Pro-only sem teaser funcional).
