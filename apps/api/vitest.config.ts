import { defineConfig } from 'vitest/config';

// Os testes de integração sobem um PGlite por arquivo e aplicam TODAS as migrações
// no beforeAll. Com a suíte crescendo, vários PGlite em paralelo estouram o
// hookTimeout padrão (10s) em máquina carregada — timeout de infra, não bug.
export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // limita instâncias simultâneas de PGlite (cada uma aplica ~28 migrações)
    maxWorkers: 4,
    minWorkers: 1,
  },
});
