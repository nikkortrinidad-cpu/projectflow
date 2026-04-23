import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/flizow.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { flizowStore } from './store/flizowStore'

// Dev-only console helpers. Lets me smoke-test the demo generator and
// reset workspace state without waiting on the Account Settings UI.
// Usage from browser console:
//   window.flizowDev.loadDemo()   // seed 50 clients
//   window.flizowDev.reset()      // wipe back to empty
if (import.meta.env.DEV) {
  (window as unknown as { flizowDev: Record<string, unknown> }).flizowDev = {
    loadDemo: () => flizowStore.loadDemoData(),
    reset:    () => flizowStore.reset(),
    store:    flizowStore,
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
