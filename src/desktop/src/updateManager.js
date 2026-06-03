import https from 'https'
import { app } from 'electron'

const REPO = 'Papyszoo/Modelibr'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`

function parseVersion(value) {
  // Drop a leading "v" and any pre-release/build suffix, then take major.minor.patch.
  return String(value ?? '')
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
}

function isNewer(candidate, current) {
  const a = parseVersion(candidate)
  const b = parseVersion(current)

  for (let i = 0; i < 3; i += 1) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x > y) return true
    if (x < y) return false
  }

  return false
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.request(
      LATEST_RELEASE_URL,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Modelibr-Desktop',
          Accept: 'application/vnd.github+json',
        },
        timeout: 10000,
      },
      response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => {
          // No published release yet — treat as "nothing newer".
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

    request.on('timeout', () => request.destroy(new Error('Update check timed out')))
    request.on('error', reject)
    request.end()
  })
}

// Checks GitHub Releases for a newer host version. The "update action" opens the
// release page so the user can download the new installer — deliberately
// dependency-free and signing-independent (works on every platform). A future
// upgrade to electron-updater could make this a one-click in-app install.
export class UpdateManager {
  constructor({ log = console.log, onChange } = {}) {
    this.log = log
    this.onChange = onChange
    this.state = {
      status: 'idle', // idle | checking | available | up-to-date | error
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseUrl: RELEASES_PAGE_URL,
      error: null,
    }
  }

  setState(patch) {
    this.state = { ...this.state, ...patch }
    this.onChange?.(this.state)
  }

  get releaseUrl() {
    return this.state.releaseUrl || RELEASES_PAGE_URL
  }

  async check() {
    this.setState({ status: 'checking', error: null })

    try {
      const release = await fetchLatestRelease()
      const latestVersion = release ? String(release.tag_name ?? '').replace(/^v/i, '') : null
      const releaseUrl = release?.html_url || RELEASES_PAGE_URL

      if (latestVersion && isNewer(latestVersion, this.state.currentVersion)) {
        this.log('[ModelibrDesktop][update] Update available', { latestVersion })
        this.setState({ status: 'available', latestVersion, releaseUrl })
      } else {
        this.setState({
          status: 'up-to-date',
          latestVersion: latestVersion || this.state.currentVersion,
          releaseUrl,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log('[ModelibrDesktop][update] Check failed', { error: message })
      this.setState({ status: 'error', error: message })
    }
  }
}
