import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/flizow.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { UndoToastProvider } from './contexts/UndoToastContext.tsx'
import { MemberProfileProvider } from './contexts/MemberProfileContext.tsx'
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
      {/* UndoToastProvider sits inside Auth so toasts can render
          on the post-auth shell. The toast itself is fixed-position
          so it lives outside any other layout container — bottom-
          right of the viewport regardless of which page is showing. */}
      <UndoToastProvider>
        {/* MemberProfileProvider owns "currently open profile" state
            for the side-panel sheet that slides in when any member
            avatar is clicked. Lives inside Auth so calls to .open()
            from anywhere in the app land on the post-auth shell.
            The panel itself is rendered by MemberProfilePanel
            mounted near the app root. */}
        <MemberProfileProvider>
          <App />
        </MemberProfileProvider>
      </UndoToastProvider>
    </AuthProvider>
  </StrictMode>,
)
