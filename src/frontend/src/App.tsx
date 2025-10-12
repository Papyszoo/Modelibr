import { NuqsAdapter } from 'nuqs/adapters/react'
import SplitterLayout from './components/layout/SplitterLayout'
import { useGlobalDragPrevention } from './hooks/useGlobalDragPrevention'
import { UploadProgressProvider } from './contexts/UploadProgressContext'
import { UploadProgressWindow } from './shared/components'
import './App.css'

function App(): JSX.Element {
  // Prevent global drag and drop of files from opening in browser
  useGlobalDragPrevention()

  return (
    <NuqsAdapter>
      <UploadProgressProvider>
        <SplitterLayout />
        <UploadProgressWindow />
      </UploadProgressProvider>
    </NuqsAdapter>
  )
}

export default App
