import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './index.css'
import { SUPABASE_CONFIGURED } from './lib/env'
import { SetupNeeded } from './components/SetupNeeded'
import { registerServiceWorker } from './lib/registerSW'

const container = document.getElementById('root')!
// Reuse the root across Vite hot reloads; calling createRoot twice on the same node breaks the DOM.
const root: Root = (import.meta.hot?.data.root as Root | undefined) ?? createRoot(container)
if (import.meta.hot) import.meta.hot.data.root = root

if (!SUPABASE_CONFIGURED) {
  // App imports the Supabase client, which refuses to start without settings, so load it only when they exist.
  root.render(<SetupNeeded />)
} else {
  import('./App').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  registerServiceWorker()
}
