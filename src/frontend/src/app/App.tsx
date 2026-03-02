import './App.css'

import { NuqsAdapter } from 'nuqs/adapters/react'
import { useEffect } from 'react'

import { SplitterLayout } from '@/components/layout/SplitterLayout'
import { useGlobalDragPrevention } from '@/hooks/useGlobalDragPrevention'
import { useTheme } from '@/hooks/useTheme'
import { UploadProgressWindow } from '@/shared/components'
import { useThumbnailSignalR } from '@/shared/thumbnail/hooks/useThumbnailSignalR'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'

function App(): JSX.Element {
  // Prevent global drag and drop of files from opening in browser
  useGlobalDragPrevention()

  // Initialize theme
  useTheme()

  // Fetch blender-enabled flag from backend at startup
  const fetchBlenderEnabled = useBlenderEnabledStore(s => s.fetchBlenderEnabled)
  useEffect(() => {
    void fetchBlenderEnabled()
  }, [fetchBlenderEnabled])

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
