import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PwaStatus } from './pwa/PwaStatus';

createRoot(document.getElementById('root')!).render(
  <StrictMode><PwaStatus /><App /></StrictMode>
);
