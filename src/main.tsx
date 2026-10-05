import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerServiceWorker } from './lib/registerSW'

const container = document.getElementById('root')!
// Reuse the root across Vite hot reloads; calling createRoot twice on the same node breaks the DOM.
const root: Root = (import.meta.hot?.data.root as Root | undefined) ?? createRoot(container)
if (import.meta.hot) import.meta.hot.data.root = root

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
