# Grosify — instruções do projeto

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Projeto
- Specs e decisões em `.specs/project/` (PROJECT.md, ROADMAP.md, STATE.md).
- **i18n**: UI em 6 idiomas (pt padrão, en, es, it, de, fr) via react-i18next. NUNCA string hardcoded em componente — sempre `t('...')` com chave em `apps/web/src/i18n/locales/*.ts` (manter os 6 arquivos em sincronia). API retorna códigos de erro (`already_in_household`), nunca texto — client traduz via `errors.*`.
- Dinheiro sempre em centavos (integer) — `formatCurrency`/`formatBRL` de `@grosify/shared`. Moeda do MVP é BRL; multi-moeda é ideia adiada (STATE.md).
- Portas locais: API 3010, web 5174, Postgres 5433 (docker compose).
- Todo acesso a dados do client passa pela camada de repositório (Dexie) — preparação pro sync offline da fase 3.
- Toda rota da API é household-scoped: `household_id` vem da sessão, nunca do body.
