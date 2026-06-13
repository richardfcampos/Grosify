# Grosify

## Visão

App de compras domésticas para famílias brasileiras (UI pt-BR). Resolve: "quanto vou gastar este mês, onde está mais barato, e o que realmente preciso comprar?"

## Problema

Famílias compram os mesmos itens todo mês, mas não sabem: quanto têm em casa, qual mercado está mais barato, se preços subiram, nem quanto vai custar a compra antes de ir.

## Solução

- **Múltiplas listas de compras** ("Compras do mês", "Churrasco", "Aniversário"), cada uma recorrente ou avulsa; recorrentes têm quantidades mensais padrão por item
- **Inventário pré-compra**: conta o que tem em casa → calcula o que falta
- **Histórico de preços** por loja/data: loja mais barata, alerta de aumento
- **Modo compra**: scanner de código de barras, registro de preço real, total corrente vs estimado, aviso "tem mais barato em X"
- **Offline-first**: funciona no mercado sem sinal; sync quando voltar
- **Household**: casa compartilhada entre membros (convite por código/link)

## Plataformas

Web primeiro (PWA mobile-first). App Expo (iOS/Android) na fase 7, reusando packages.

## Monetização

Freemium + assinatura:
- **Free**: 1 casa, 30 itens, histórico de preços 90 dias
- **Pro** (~R$9,90/mês): itens ilimitados, histórico completo, export
- Assinatura pertence ao household (paga pelo owner). Enforcement no servidor (sync push).
- Stripe (verificar Pix recorrente; fallback Mercado Pago atrás de interface)

## Princípios

YAGNI / KISS / DRY. Tech boring e provada. Custo de infra inicial ≈ $6/mês. Tudo household-scoped (segurança). Dinheiro sempre em centavos (integer).

## Métricas de sucesso (MVP)

- Dogfood: compra do mês feita 100% no app, offline no mercado
- Alpha com família usando lista + preços antes da fase 4
