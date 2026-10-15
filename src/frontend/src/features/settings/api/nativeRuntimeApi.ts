import { client } from '@/lib/apiBase'

/**
 * The native desktop host's own runtime configuration. These endpoints exist
 * only when the web UI is served by the Electron tray host's edge server
 * (`GET` is public to the served page, `PUT` is loopback-only); a browser or
 * Docker deployment gets a 404, which is how the UI detects native mode.
 */
export interface NativeRuntimeSnapshot {
  appPort: number
  internalApiPort: number
  postgresPort: number
  workerProcessCount: number
  maxConcurrentJobsPerWorker: number
  enableHardwareAcceleration: boolean
  dataDirectory: string
  allowNetworkAccess: boolean
  startOnLogin: boolean
  autoDownloadUpdates: boolean
  pendingRestart?: boolean
}

export async function getNativeRuntime(): Promise<NativeRuntimeSnapshot> {
  const response = await client.get('/native/runtime')
  return response.data
}

export async function updateNativeRuntime(
  patch: Partial<
    Pick<NativeRuntimeSnapshot, 'startOnLogin' | 'autoDownloadUpdates'>
  >
): Promise<{ restartRequired: boolean; config: NativeRuntimeSnapshot }> {
  const response = await client.put('/native/runtime', patch)
  return response.data
}
