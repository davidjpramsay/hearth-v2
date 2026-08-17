import '@fontsource-variable/source-sans-3';
import './styles/tokens.css';
import './styles/app.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { initializeAppearance } from './appearance/appearance';
import { App } from './App';
import { HearthRuntimeBootstrap } from './runtime/HearthRuntime';

initializeAppearance();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
});

const root = document.querySelector('#root');
if (root === null) throw new Error('Hearth root element was not found.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HearthRuntimeBootstrap>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </HearthRuntimeBootstrap>
    </QueryClientProvider>
  </StrictMode>,
);
