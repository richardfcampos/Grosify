import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n/index.js';
import './index.css';
import '@grosify/ui/style.css';
import './features/ui/theme.css';
import { ConfirmProvider } from './lib/confirm.js';
import { ThemeProvider } from './features/ui/theme-provider.js';
import { trackKeyboardInset } from './lib/keyboard-inset.js';
import { disableZoomGestures } from './lib/disable-zoom-gestures.js';
import { router } from './router.js';

trackKeyboardInset();
disableZoomGestures();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
