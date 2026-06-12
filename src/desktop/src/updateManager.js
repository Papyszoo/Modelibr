import { app, shell } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

const REPO = 'Papyszoo/Modelibr'
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`

// Wraps electron-updater so the host can check GitHub Releases, download a newer
// version in the background, and install it on quit. The "update action" becomes
// a real one-click "Restart & Install" once a build is downloaded.
//
// Note: macOS auto-install requires the app to be code-signed (Squirrel.Mac
// verifies the signature). On unsigned macOS builds the download/install step
// errors; we catch it and fall back to opening the releases page so the user can
// update manually. Windows (NSIS) and Linux (AppImage) update without signing.
export class UpdateManager {
  constructor({ log = console.log, onChange } = {}) {
    this.log = log
    this.onChange = onChange
    this.state = {
      // idle | checking | downloading | downloaded | up-to-date | error
      status: 'idle',
      currentVersion: app.getVersion(),
      latestVersion: null,
      percent: 0,
      releaseUrl: RELEASES_PAGE_URL,
      error: null,
    }
    this._wired = false
  }

  setState(patch) {
    this.state = { ...this.state, ...patch }
    this.onChange?.(this.state)
  }

  get releaseUrl() {
    return this.state.releaseUrl || RELEASES_PAGE_URL
  }

  _wire() {
    if (this._wired) {
      return
    }
    this._wired = true

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: msg => this.log('[ModelibrDesktop][update]', msg),
      warn: msg => this.log('[ModelibrDesktop][update][warn]', msg),
      error: msg => this.log('[ModelibrDesktop][update][error]', msg),
      debug: () => {},
    }

    autoUpdater.on('checking-for-update', () =>
      this.setState({ status: 'checking', error: null })
    )
    autoUpdater.on('update-available', info =>
      this.setState({ status: 'downloading', latestVersion: info?.version ?? null, percent: 0 })
    )
    autoUpdater.on('update-not-available', info =>
      this.setState({
        status: 'up-to-date',
        latestVersion: info?.version ?? this.state.currentVersion,
      })
    )
    autoUpdater.on('download-progress', progress =>
      this.setState({ status: 'downloading', percent: Math.round(progress?.percent ?? 0) })
    )
    autoUpdater.on('update-downloaded', info =>
      this.setState({ status: 'downloaded', latestVersion: info?.version ?? null, percent: 100 })
    )
    autoUpdater.on('error', error => {
      const message = error instanceof Error ? error.message : String(error)
      this.log('[ModelibrDesktop][update] Error', { error: message })
      this.setState({ status: 'error', error: message })
    })
  }

  async check() {
    // electron-updater only works on packaged builds with update metadata.
    if (!app.isPackaged) {
      this.setState({ status: 'up-to-date' })
      return
    }

    this._wire()
    this.setState({ status: 'checking', error: null })

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log('[ModelibrDesktop][update] Check failed', { error: message })
      this.setState({ status: 'error', error: message })
    }
  }

  // The "Update" button: install a downloaded build, otherwise open the releases
  // page (covers unsigned macOS and the "not downloaded yet" case).
  install() {
    if (this.state.status === 'downloaded') {
      try {
        autoUpdater.quitAndInstall()
        return
      } catch (error) {
        this.log('[ModelibrDesktop][update] quitAndInstall failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    void shell.openExternal(this.releaseUrl)
  }
}
