import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type JSX } from 'react'

import { updateNativeRuntime } from './api/nativeRuntimeApi'
import { useNativeRuntimeQuery } from './api/queries'
import { SettingToggle } from './SettingToggle'

/**
 * Desktop-only options, persisted in the Electron host's native-runtime.json
 * through its loopback-only runtime endpoint. The Settings page only shows this
 * section when that endpoint answers (i.e. when served by the native host).
 */
export function NativeDesktopSection(): JSX.Element {
  const queryClient = useQueryClient()
  const runtimeQuery = useNativeRuntimeQuery()

  const save = useMutation({
    mutationFn: updateNativeRuntime,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['native-runtime'] })
    },
  })

  if (runtimeQuery.isLoading) {
    return <div className="settings-help">Loading desktop options…</div>
  }

  if (runtimeQuery.isError || !runtimeQuery.data) {
    return (
      <div className="settings-help">
        Desktop options are unavailable - the native app host did not answer.
      </div>
    )
  }

  const config = runtimeQuery.data

  return (
    <>
      <SettingToggle
        id="startOnLogin"
        label="Start on login"
        help="Launch Modelibr when you sign in to this computer."
        isOn={config.startOnLogin}
        saving={save.isPending}
        onChange={next => save.mutate({ startOnLogin: next })}
      />

      <SettingToggle
        id="autoDownloadUpdates"
        label="Download updates automatically"
        help="Updates download in the background when available; installing stays your choice."
        isOn={config.autoDownloadUpdates}
        saving={save.isPending}
        onChange={next => save.mutate({ autoDownloadUpdates: next })}
      />

      {save.isError && (
        <div className="settings-error">
          <strong>Error:</strong>{' '}
          {save.error instanceof Error
            ? save.error.message
            : 'Failed to save desktop option'}
        </div>
      )}
    </>
  )
}
