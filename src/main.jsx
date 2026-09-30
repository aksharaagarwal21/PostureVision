import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { captureInstallPrompt } from './pwa/installPrompt'

// Chrome can offer the install prompt before React mounts
captureInstallPrompt()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
