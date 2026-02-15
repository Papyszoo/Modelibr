/**
 * OS Detection and WebDAV Path Utilities
 * Provides platform detection and generates native file system paths for WebDAV resources.
 */

export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'unknown'

/**
 * Detects the client's operating system from the user agent.
 */
export function detectOS(): OperatingSystem {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('win')) {
    return 'windows'
  } else if (userAgent.includes('mac')) {
    return 'macos'
  } else if (userAgent.includes('linux')) {
    return 'linux'
  }

  return 'unknown'
}

/**
 * Generates the WebDAV server URL based on the current API configuration.
 */
export function getWebDavBaseUrl(): string {
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
  const url = new URL(apiBaseUrl)
  return `${url.protocol}//${url.host}/modelibr`
}

/**
 * Gets the WebDAV server hostname and port.
 */
function getWebDavHostInfo(): { host: string; port: string; isHttps: boolean } {
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
  const url = new URL(apiBaseUrl)
  const isHttps = url.protocol === 'https:'
  const defaultPort = isHttps ? '443' : '80'
  const port = url.port || defaultPort
  return { host: url.hostname, port, isHttps }
}

export interface WebDavPathInfo {
  /** The native path to open in the file explorer (UNC for Windows, smb:// for Mac/Linux) */
  nativePath: string
  /** The HTTP/HTTPS WebDAV URL */
  webDavUrl: string
  /** The operating system detected */
  os: OperatingSystem
  /** Whether this path can be opened natively */
  canOpenNatively: boolean
}

/**
 * Generates the native file system path for a WebDAV resource.
 *
 * @param virtualPath - The virtual path within the WebDAV namespace (e.g., "Projects/MyProject/Models")
 * @returns PathInfo with native and WebDAV URLs
 */
export function getWebDavPath(virtualPath: string): WebDavPathInfo {
  const os = detectOS()
  const { host, port, isHttps } = getWebDavHostInfo()
  const cleanPath = virtualPath.replace(/^\/+/, '').replace(/\/+$/, '')

  const webDavUrl = `${getWebDavBaseUrl()}/${cleanPath}`

  let nativePath: string
  let canOpenNatively = true

  switch (os) {
    case 'windows':
      // Windows uses WebDAV via mapped network drives or UNC paths
      // Format: \\server@port\path or \\server@SSL@port\path for HTTPS
      {
        const portStr = port === '80' || port === '443' ? '' : `@${port}`
        const sslStr = isHttps ? '@SSL' : ''
        nativePath = `\\\\${host}${sslStr}${portStr}\\modelibr\\${cleanPath.replace(/\//g, '\\')}`
      }
      break

    case 'macos':
      // macOS uses smb:// or http(s):// URLs
      // macOS Finder can open HTTP(S) WebDAV URLs directly
      nativePath = webDavUrl
      break

    case 'linux':
      // Linux uses davfs2 or gvfs, typically mounted at a path
      // For GNOME/gvfs: dav(s)://server:port/path
      {
        const davProtocol = isHttps ? 'davs' : 'dav'
        nativePath = `${davProtocol}://${host}:${port}/modelibr/${cleanPath}`
      }
      break

    default:
      nativePath = webDavUrl
      canOpenNatively = false
  }

  return {
    nativePath,
    webDavUrl,
    os,
    canOpenNatively,
  }
}

/**
 * Generates the path for a project's asset folder.
 */
export function getProjectAssetPath(
  projectName: string,
  assetType: 'Models' | 'TextureSets' | 'Sprites' | 'Sounds'
): WebDavPathInfo {
  return getWebDavPath(
    `Projects/${encodeURIComponent(projectName)}/${assetType}`
  )
}

/**
 * Generates the path for a sound category folder.
 */
export function getSoundCategoryPath(categoryName: string): WebDavPathInfo {
  return getWebDavPath(`Sounds/${encodeURIComponent(categoryName)}`)
}

/**
 * Attempts to open the file explorer at the given WebDAV path.
 * Returns true if the attempt was made (does not guarantee success).
 *
 * Note: Due to browser security restrictions, this typically works best when:
 * - The WebDAV drive is already mounted
 * - Using a custom URL scheme handler
 * - Running as a PWA with elevated permissions
 */
export async function openInFileExplorer(
  virtualPath: string
): Promise<{ success: boolean; message: string }> {
  const pathInfo = getWebDavPath(virtualPath)

  return {
    success: false,
    message: `Cannot open file explorer automatically. Please copy the path: ${pathInfo.nativePath}`,
  }

  const os = pathInfo.os

  try {
    if (os === 'windows') {
      // Windows: Try to open using explorer protocol
      // This typically works if the WebDAV share is already mapped
      window.open(
        `file:///${pathInfo.nativePath.replace(/\\/g, '/')}`,
        '_blank',
        'noopener,noreferrer'
      )
      return {
        success: true,
        message:
          'Opening in Windows Explorer. If nothing happens, mount the WebDAV drive first.',
      }
    } else if (os === 'macos') {
      // macOS: Finder can open WebDAV URLs directly
      // Using the reveal-in-finder scheme or direct URL
      window.location.href = pathInfo.nativePath
      return {
        success: true,
        message:
          'Opening in Finder. You may be prompted to connect to the server.',
      }
    } else if (os === 'linux') {
      // Linux: Try xdg-open via a custom protocol handler
      // This requires the user to have set up a handler
      window.open(pathInfo.nativePath, '_blank', 'noopener,noreferrer')
      return {
        success: true,
        message:
          'Opening in file manager. Ensure your system supports WebDAV URLs.',
      }
    }

    return {
      success: false,
      message: 'Unable to determine how to open file explorer on this system.',
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to open file explorer: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Copies the native path to clipboard.
 */
export async function copyPathToClipboard(
  virtualPath: string
): Promise<{ success: boolean; path: string }> {
  const pathInfo = getWebDavPath(virtualPath)

  try {
    await navigator.clipboard.writeText(pathInfo.nativePath)
    return { success: true, path: pathInfo.nativePath }
  } catch {
    return { success: false, path: pathInfo.nativePath }
  }
}

/**
 * Returns the OS-specific success message for copying the WebDAV path.
 */
export function getCopyPathSuccessMessage(): string {
  const os = detectOS()

  switch (os) {
    case 'macos':
      return 'Path copied. Use Finder → Go → Connect to Server (⌘K) to open.'
    case 'windows':
      return 'Path copied. Paste it in File Explorer address bar to open.'
    case 'linux':
      return 'Path copied. Paste in your file manager (Ctrl+L) to open.'
    default:
      return 'Path copied to clipboard.'
  }
}

/**
 * Gets instructions for mounting the WebDAV drive based on the detected OS.
 */
export function getMountInstructions(): {
  os: OperatingSystem
  instructions: string
} {
  const os = detectOS()
  const { host, port, isHttps } = getWebDavHostInfo()
  const protocol = isHttps ? 'https' : 'http'
  const webDavUrl = `${protocol}://${host}:${port}/modelibr`

  switch (os) {
    case 'windows':
      return {
        os,
        instructions: `Accessing via Windows Explorer:
 
 1. Open File Explorer
 2. Paste this path into the address bar:
 
 ${webDavUrl.replace('http://', '\\\\').replace(/\//g, '\\')}
 
 Or use the legacy mapped drive method:
 1. Right-click "This PC" > "Map network drive..."
 2. Folder: ${webDavUrl}`,
      }

    case 'macos':
      return {
        os,
        instructions: `To mount the WebDAV drive on macOS:

1. Open Finder
2. Press Cmd+K or select Go > Connect to Server
3. Enter: ${webDavUrl}
4. Click "Connect"
5. Enter credentials if prompted`,
      }

    case 'linux':
      return {
        os,
        instructions: `To mount the WebDAV drive on Linux:

Using GNOME/Nautilus:
1. Open Files (Nautilus)
2. Press Ctrl+L to show the location bar
3. Enter: davs://${host}:${port}/modelibr
4. Press Enter and enter credentials`,
      }

    default:
      return {
        os,
        instructions: `Connect to WebDAV server at: ${webDavUrl}`,
      }
  }
}
