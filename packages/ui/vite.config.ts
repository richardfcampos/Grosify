import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Lib build: ESM bundle + tipos (.d.ts) + style.css único.
// O conversor do design-sync lê dist/index.es.js (entry) + a árvore .d.ts + style.css.
export default defineConfig({
  plugins: [react(), dts({ include: ['src'], entryRoot: 'src', rollupTypes: false })],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.es.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
