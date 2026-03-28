import { create } from 'zustand'

import type { WebDavUrlEntry } from '@/features/settings/api/settingsApi'
import { detectOS, type WebDavPathInfo } from '@/utils/webdavUtils'

interface WebDavStore {
  /**
   * Auto-selected WebDAV base URL.
   * HTTP entry is preferred; falls back to HTTPS if HTTP is not configured.
   * Null until initialised from the /settings/webdav/urls endpoint.
   */
  activeUrl: string | null
  /**
   * Selects the preferred URL from the list of configured entries.
   * Prefers HTTP over HTTPS for local-network reliability.
   */
  initFromUrls: (urls: WebDavUrlEntry[]) => void
}

export const useWebDavStore = create<WebDavStore>(set => ({
  activeUrl: null,
  initFromUrls: urls => {
    const httpEntry = urls.find(e => !e.isHttps)
    const httpsEntry = urls.find(e => e.isHttps)
    const preferred = httpEntry ?? httpsEntry ?? null
    set({ activeUrl: preferred?.url ?? null })
  },
}))

/**
 * Returns the resolved WebDAV base URL including the /modelibr mount path.
 * Prefers the auto-selected active URL; falls back to window.location.origin.
 */
function getResolvedBaseUrl(): string {
  const { activeUrl } = useWebDavStore.getState()
  if (activeUrl) {
    return activeUrl.replace(/\/+$/, '') + '/modelibr'
  }
  return `${window.location.protocol}//${window.location.host}/modelibr`
}

/**
 * Builds a platform-aware WebDAV path for a virtual resource.
 * HTTP is preferred for all platforms on local networks.
 */
export function buildWebDavPath(virtualPath: string): WebDavPathInfo {
  const os = detectOS()
  const baseUrl = getResolvedBaseUrl()
  const cleanPath = virtualPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const webDavUrl = `${baseUrl}/${cleanPath}`

  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseUrl)
  } catch {
    return { nativePath: webDavUrl, webDavUrl, os, canOpenNatively: false }
  }

  const host = parsedUrl.hostname
  const port =
    parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')
  const isHttps = parsedUrl.protocol === 'https:'

  let nativePath: string
  let canOpenNatively = true

  switch (os) {
    case 'windows':
      nativePath = `\\\\${host}\\modelibr\\${cleanPath.replace(/\//g, '\\')}`
      break
    case 'macos':
      nativePath = webDavUrl
      break
    case 'linux': {
      const davProtocol = isHttps ? 'davs' : 'dav'
      nativePath = `${davProtocol}://${host}:${port}/modelibr/${cleanPath}`
      break
    }
    default:
      nativePath = webDavUrl
      canOpenNatively = false
  }

  return { nativePath, webDavUrl, os, canOpenNatively }
}
