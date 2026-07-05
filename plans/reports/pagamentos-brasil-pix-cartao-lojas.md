# Research: pagamento pro Grosify (Pix + cartão + lojas) — 2026-07-05

## Resumo executivo (brutal)
1. **Provedor**: pra assinatura BR com Pix + cartão, o par que vale é **Mercado Pago** ou **Asaas**. Stripe é a melhor API mas Pix pra empresa BR é *invite-only* e cartão é mais caro. STATE.md já apontava MP — a pesquisa confirma; Asaas é a alternativa mais barata.
2. **Recorrência**: o método rei no BR é **Pix Automático** (cartão tem churn/recusa alto; Pix = ~80% dos pagamentos). Sem custo extra além da tarifa Pix normal. Disponível em MP, Asaas (PJ), PagBrasil.
3. **Web ≠ apps**: **NÃO precisa (nem deve) ter a mesma forma de pagamento no webapp e nos apps iOS/Android.** No **PWA/web** você cobra direto pelo provedor (Pix/cartão, taxa 1–4%). Nos apps nativos, Apple/Google historicamente exigem a loja (IAP, 15–30%). Como o Grosify é **PWA**, dá pra cobrar 100% no web e fugir da taxa de loja — é a maior alavanca de margem.

## Taxas (BR, 2026)
| Provedor | Pix | Cartão crédito | Recorrência | Notas |
|---|---|---|---|---|
| **Mercado Pago** | baixa (~0,99%) | ~3,79–4,98% | Pix Automático + cartão recorrente | menor barreira, ecossistema, checkout pronto |
| **Asaas** | baixa (Pix ~R$/%) | R$ 0,49 + **1,99%** (parcelado/assinatura) | Pix Automático (PJ) + assinatura | mais barato em cartão; foco recorrência BR |
| **Stripe BR** | **1,19%** | 3,99% + R$ 0,39 (+0,4% recorrência) | Pix Automático, Billing | **Pix invite-only p/ empresa BR**; melhor API/DX |
| **Pagar.me** | competitiva | negociável por volume | sim | bom p/ alto volume/customização |
| **PagBrasil** | competitiva | — | 1º com Pix Automático (PagStream) | + parceiro alternative billing Google Play |

> Débito: **cartão de débito recorrente quase não existe** no BR pra assinatura — o **Pix Automático substitui o débito recorrente** (autoriza no app do banco). Débito avulso dá pra aceitar, mas não vale a pena pra assinatura.

## A parte crítica: lojas (Apple/Google) — mudou em 2026
- **Apple (iOS)**: assinatura digital sempre exigiu **IAP (15–30%)**. Pós-Epic (abr/2025 EUA) + **acordo CADE no Brasil, vigente 20/jun/2026**: apps iOS no Brasil **podem** oferecer pagamento alternativo/link pro checkout web — **mas a Apple exige que o IAP apareça ao lado** da opção alternativa.
- **Google (Android)**: Brasil tem **user-choice billing** (billing alternativo ao lado do Google). **Brasil mantém as taxas antigas até 30/set/2027**; billing alternativo reduz a taxa (Google ainda leva um corte). Pix via alternative billing rola (ex.: PagBrasil).
- **Consequência prática**: mesmo com as aberturas de 2026, dentro dos apps nativos você **ainda lida com regra de loja**. O caminho limpo: **vender a assinatura no web** (o usuário assina no site/PWA, loga no app e destrava). O app nativo só reconhece o plano — não processa pagamento.

## Recomendação pro Grosify
- **Agora (PWA)**: integrar **1 provedor** — **Mercado Pago** (já era a decisão; Pix + Pix Automático + cartão, checkout pronto) OU **Asaas** (mais barato em cartão, ótimo recorrente). Cobrar tudo no web. Zero taxa de loja.
- **Assinatura = household** (já decidido). Método recomendado ao usuário: **Pix Automático** (barato, sem churn) com **cartão como fallback**.
- **Quando lançar Expo (iOS/Android)**: **não** colocar checkout dentro do app. Assinatura acontece no web; app destrava via conta. Se um dia quiser vender dentro do app, aí sim entra IAP/alternative billing (com a taxa da loja).
- **Arquitetura de código**: manter a camada de billing **atrás de uma porta/adapter** (igual fizemos com e-mail e R2) — provider concreto plugável. Assim troca MP↔Asaas sem reescrever, e adiciona IAP no futuro como outro adapter.

## Próximos passos
1. Escolher **MP vs Asaas** (recomendo começar por **Asaas** se prioridade é taxa de cartão + Pix; **MP** se prioridade é menor fricção/checkout pronto).
2. Criar conta PJ + habilitar **Pix Automático** (exige PJ).
3. Implementar no web: checkout + webhook de status + preapproval/mandate do Pix Automático (env-gated, igual e-mail/R2).
4. Modelar tabela de assinatura no household (status, provider, ciclo, próxima cobrança).

## Perguntas em aberto
- **PJ**: você já tem CNPJ? Pix Automático e as melhores taxas exigem conta PJ.
- **Preço do plano Pro** e ciclo (mensal/anual)? Muda a conta de qual taxa dói mais.
- Quer **débito avulso** mesmo, ou Pix Automático cobre a necessidade de "débito recorrente"?
- Prioridade: **menor taxa** (→ Asaas/Pix) ou **menor esforço de integração** (→ Mercado Pago)?
