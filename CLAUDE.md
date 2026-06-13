# Grosify — instruções do projeto

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Projeto
- Specs e decisões em `.specs/project/` (PROJECT.md, ROADMAP.md, STATE.md).
- UI em pt-BR. Dinheiro sempre em centavos (integer) — usar `formatBRL` de `@grosify/shared`.
- Portas locais: API 3010, web 5174, Postgres 5433 (docker compose).
- Todo acesso a dados do client passa pela camada de repositório (Dexie) — preparação pro sync offline da fase 3.
- Toda rota da API é household-scoped: `household_id` vem da sessão, nunca do body.
