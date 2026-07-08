import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/components/theme-provider.tsx'
import { initDb } from '@/db/client'

// Start database initialization early
initDb().catch((err) => console.error('Database initialization error:', err))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
