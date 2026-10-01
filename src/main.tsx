import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { retireLegacyServiceWorker } from './utils/legacyServiceWorker'

// Do not let the old static app keep serving its cached HTML after migration.
if ('serviceWorker' in navigator) {
  void retireLegacyServiceWorker(navigator.serviceWorker, window.caches, location.origin)
    .catch(() => console.warn('Could not retire the legacy Sorstar service worker.'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
