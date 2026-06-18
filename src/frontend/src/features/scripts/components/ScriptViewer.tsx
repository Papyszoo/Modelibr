import './ScriptViewer.css'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ProgressSpinner } from 'primereact/progressspinner'

import { getScriptById } from '@/features/scripts/api/scriptApi'

import { ScriptEditor } from './ScriptEditor'

interface ScriptViewerProps {
  scriptId: number
  tabId: string
}

/**
 * Full-page host for a single script: fetches it by id and renders the editor.
 * This replaces the previous modal so scripts open in their own tab.
 */
export function ScriptViewer({ scriptId }: ScriptViewerProps) {
  const queryClient = useQueryClient()
  const {
    data: script,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['script', scriptId],
    queryFn: () => getScriptById(scriptId),
  })

  if (isLoading) {
    return (
      <div className="script-viewer-loading">
        <ProgressSpinner />
      </div>
    )
  }

  if (isError || !script) {
    return (
      <div className="script-viewer-error">
        <i className="pi pi-exclamation-triangle" />
        <p>Could not load this script. It may have been deleted.</p>
      </div>
    )
  }

  return (
    <div className="script-viewer">
      <ScriptEditor
        script={script}
        onScriptUpdated={() => {
          // Keep the list and this tab's copy in sync after metadata edits.
          queryClient.invalidateQueries({ queryKey: ['script', scriptId] })
          queryClient.invalidateQueries({ queryKey: ['scripts'] })
        }}
      />
    </div>
  )
}
