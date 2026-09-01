import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* HashRouter (not BrowserRouter): this app is hosted as a static
        GitHub Pages project page, which has no server-side rewrite for
        deep links — a hash-based route never round-trips through the
        server, so refreshing /history or opening it from the home
        screen always works. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a nice-to-have; ignore registration failures.
    })
  })
}
