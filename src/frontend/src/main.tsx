import { createRoot } from 'react-dom/client'
import { AppProvider } from './app/providers'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './index.css'
import App from './app/App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find the root element')

createRoot(rootElement).render(
  <AppProvider>
    <App />
  </AppProvider>
)
