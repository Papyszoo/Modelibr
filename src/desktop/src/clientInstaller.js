import { createWriteStream } from 'fs'
import fs from 'fs/promises'
import https from 'https'
import os from 'os'
import path from 'path'

const REPO = 'Papyszoo/Modelibr'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`

export const CLIENT_RELEASES_URL = RELEASES_PAGE_URL

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Modelibr-Desktop',
          Accept: 'application/vnd.github+json',
        },
        timeout: 15000,
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          if (response.statusCode === 404) {
            resolve(null)
            return
          }
          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            reject(new Error(`GitHub API responded ${response.statusCode}`))
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    request.on('timeout', () => request.destroy(new Error('Request timed out')))
    request.on('error', reject)
    request.end()
  })
}

// GitHub asset URLs 302-redirect to a CDN, so follow redirects manually.
function download(url, destPath, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { 'User-Agent': 'Modelibr-Desktop' }, timeout: 30000 },
      response => {
        const { statusCode, headers } = response

        if (
          statusCode &&
          statusCode >= 300 &&
          statusCode < 400 &&
          headers.location
        ) {
          response.resume()
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'))
            return
          }
          resolve(download(headers.location, destPath, onProgress, redirectsLeft - 1))
          return
        }

        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Download failed with status ${statusCode}`))
          return
        }

        const total = Number(headers['content-length']) || 0
        let received = 0
        const file = createWriteStream(destPath)

        response.on('data', chunk => {
          received += chunk.length
          if (total && onProgress) {
            onProgress(Math.min(100, Math.round((received / total) * 100)))
          }
        })
        response.pipe(file)
        file.on('finish', () => file.close(() => resolve(destPath)))
        file.on('error', reject)
        response.on('error', reject)
      }
    )
    request.on('timeout', () => request.destroy(new Error('Download timed out')))
    request.on('error', reject)
  })
}

// Tokens that identify a desktop-client installer asset for this platform.
function platformMatchers() {
  switch (process.platform) {
    case 'win32':
      return { os: 'windows', exts: ['.exe'] }
    case 'darwin':
      return { os: 'macos', exts: ['.dmg'] }
    default:
      // AppImage first: portable and installs without root, unlike .deb.
      return { os: 'linux', exts: ['.AppImage', '.deb'] }
  }
}

export function pickClientAsset(release) {
  const assets = release?.assets ?? []
  const { os: osToken, exts } = platformMatchers()
  const arch = process.arch // 'x64' | 'arm64' | …

  const candidates = assets.filter(asset => {
    const name = String(asset.name || '').toLowerCase()
    return (
      name.includes('client') &&
      name.includes(osToken) &&
      exts.some(ext => name.endsWith(ext.toLowerCase()))
    )
  })

  if (candidates.length === 0) {
    return null
  }

  // Prefer an exact arch match, then the earliest extension preference.
  const byExt = ext => candidates.filter(a => a.name.toLowerCase().endsWith(ext.toLowerCase()))
  for (const ext of exts) {
    const forExt = byExt(ext)
    if (forExt.length === 0) continue
    const archMatch = forExt.find(a => a.name.toLowerCase().includes(arch))
    return archMatch || forExt[0]
  }

  return candidates[0]
}

// Downloads the matching desktop-client installer from the latest release and
// launches it (NSIS wizard / mounts the dmg / runs the AppImage). Returns a
// status object; throws only on unexpected errors. `openExternal`/`openPath`
// are injected so this module stays free of an electron import.
export async function installClient({ onProgress, openPath, openExternal, log = console.log }) {
  onProgress?.({ phase: 'checking', percent: 0, message: 'Finding latest release…' })

  const release = await fetchJson(LATEST_RELEASE_URL)
  const asset = pickClientAsset(release)

  if (!asset) {
    // No matching installer (e.g. no release yet) — fall back to the page.
    log('[ModelibrDesktop][client-install] No matching asset; opening releases page')
    await openExternal?.(RELEASES_PAGE_URL)
    return { ok: false, reason: 'no-asset' }
  }

  const downloadDir = path.join(os.tmpdir(), 'modelibr-client-install')
  await fs.mkdir(downloadDir, { recursive: true })
  const destPath = path.join(downloadDir, asset.name)

  onProgress?.({ phase: 'downloading', percent: 0, message: `Downloading ${asset.name}…` })
  log('[ModelibrDesktop][client-install] Downloading', { name: asset.name })

  await download(asset.browser_download_url, destPath, percent =>
    onProgress?.({ phase: 'downloading', percent, message: `Downloading ${asset.name}… ${percent}%` })
  )

  // AppImages need the executable bit before they can be launched.
  if (destPath.endsWith('.AppImage')) {
    await fs.chmod(destPath, 0o755).catch(() => {})
  }

  onProgress?.({ phase: 'launching', percent: 100, message: 'Opening installer…' })
  log('[ModelibrDesktop][client-install] Launching installer', { destPath })

  const openError = await openPath?.(destPath)
  if (openError) {
    // openPath resolves with a non-empty string on failure.
    throw new Error(openError)
  }

  return { ok: true, asset: asset.name }
}
