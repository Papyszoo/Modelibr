import './App.css'

import { NuqsAdapter } from 'nuqs/adapters/react'
import { useEffect } from 'react'

import { DemoBanner } from '@/components/DemoBanner'
import { AppShell } from '@/components/layout/AppShell'
import { getWebDavUrls } from '@/features/settings/api/settingsApi'
import { useGlobalDragPrevention } from '@/hooks/useGlobalDragPrevention'
import { useTheme } from '@/hooks/useTheme'
import { UploadProgressWindow } from '@/shared/components'
import { useThumbnailSignalR } from '@/shared/thumbnail/hooks/useThumbnailSignalR'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'
import { useWebDavStore } from '@/stores/webDavStore'

const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'

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

  // Initialize WebDAV store: HTTP is preferred; falls back to HTTPS if HTTP not configured
  const initWebDavFromUrls = useWebDavStore(s => s.initFromUrls)
  useEffect(() => {
    getWebDavUrls()
      .then(({ urls }) => initWebDavFromUrls(urls))
      .catch(() => {}) // non-critical
  }, [initWebDavFromUrls])

  // Connect to SignalR at the app level so all components receive thumbnail events
  useThumbnailSignalR([])

  return (
    <NuqsAdapter>
      <AppShell />
      <UploadProgressWindow />
      {isDemo && <DemoBanner />}
    </NuqsAdapter>
  )
}

export default App
