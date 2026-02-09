import { NuqsAdapter } from 'nuqs/adapters/react'
import SplitterLayout from './components/layout/SplitterLayout'
import { useGlobalDragPrevention } from './hooks/useGlobalDragPrevention'
import { useTheme } from './hooks/useTheme'
import { useThumbnailSignalR } from './features/thumbnail/hooks/useThumbnailSignalR'
import { UploadProgressWindow } from './shared/components'
import './App.css'

function App(): JSX.Element {
  // Prevent global drag and drop of files from opening in browser
  useGlobalDragPrevention()

  // Initialize theme
  useTheme()

  // Connect to SignalR at the app level so all components receive thumbnail events
  useThumbnailSignalR([])

  return (
    <NuqsAdapter>
      <SplitterLayout />
      <UploadProgressWindow />
    </NuqsAdapter>
  )
}

export default App
