import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './index.css'

import { createRoot } from 'react-dom/client'

import App from './app/App'
import { AppProvider } from './app/providers'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find the root element')

createRoot(rootElement).render(
  <AppProvider>
    <App />
  </AppProvider>
)
