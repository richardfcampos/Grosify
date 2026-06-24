import { defineConfig } from 'vitest/config';

// Config própria do vitest (não puxa os plugins do vite.config do app — PWA/react
// não são necessários pra testar lógica/Dexie em ambiente node).
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
