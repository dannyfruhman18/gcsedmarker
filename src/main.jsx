import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles.css'
import { APP_NAME } from './lib/constants'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(`${APP_NAME} cannot start: missing root element #root.`)
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
