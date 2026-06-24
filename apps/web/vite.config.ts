import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { port: 5174 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Grosify',
        short_name: 'Grosify',
        description: 'Compras do mês organizadas: lista, preços e inventário',
        lang: 'pt-BR',
        display: 'standalone',
        // bg claro do app (splash + barra de status inicial no standalone, antes do JS
        // ajustar por modo); evita a barra verde sobre o app off-white
        background_color: '#fafaf7',
        theme_color: '#fafaf7',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
});
