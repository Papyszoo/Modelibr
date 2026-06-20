const REPO = 'Papyszoo/Modelibr'
const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`

// Wraps electron-updater so the host can check GitHub Releases for a newer build
// and surface it in the tray. Updates are *opt-in*: we keep checking on launch,
// but nothing downloads or installs until the user clicks — first "Download
// update", then "Restart & Install". A user may have good reasons to stay on a
// stable build, so we never download in the background or install on quit.
//
// Note: macOS auto-install requires the app to be code-signed (Squirrel.Mac
// verifies the signature). On unsigned macOS builds the download/install step
// errors; we catch it and fall back to opening the releases page so the user can
// update manually. Windows (NSIS) and Linux (AppImage) update without signing.
//
// electron is injected (autoUpdater / currentVersion / isPackaged / openExternal)
// so this module stays free of the `electron` import and is unit-testable under
// `node --test`, like the other desktop modules.
export class UpdateManager {
  constructor({
    autoUpdater,
    currentVersion = '0.0.0',
    isPackaged = true,
    openExternal = () => {},
    log = console.log,
    onChange,
  } = {}) {
    this.autoUpdater = autoUpdater
    this.isPackaged = isPackaged
    this.openExternal = openExternal
    this.log = log
    this.onChange = onChange
    this.state = {
      // idle | checking | available | downloading | downloaded | up-to-date | error
      status: 'idle',
      currentVersion,
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

    // Opt-in: don't pull a build down or slip it in on quit behind the user.
    this.autoUpdater.autoDownload = false
    this.autoUpdater.autoInstallOnAppQuit = false
    this.autoUpdater.logger = {
      info: msg => this.log('[ModelibrDesktop][update]', msg),
      warn: msg => this.log('[ModelibrDesktop][update][warn]', msg),
      error: msg => this.log('[ModelibrDesktop][update][error]', msg),
      debug: () => {},
    }

    this.autoUpdater.on('checking-for-update', () =>
      this.setState({ status: 'checking', error: null })
    )
    // A newer build exists but we DON'T download it — wait for the user.
    this.autoUpdater.on('update-available', info =>
      this.setState({ status: 'available', latestVersion: info?.version ?? null, percent: 0 })
    )
    this.autoUpdater.on('update-not-available', info =>
      this.setState({
        status: 'up-to-date',
        latestVersion: info?.version ?? this.state.currentVersion,
      })
    )
    this.autoUpdater.on('download-progress', progress =>
      this.setState({ status: 'downloading', percent: Math.round(progress?.percent ?? 0) })
    )
    this.autoUpdater.on('update-downloaded', info =>
      this.setState({ status: 'downloaded', latestVersion: info?.version ?? null, percent: 100 })
    )
    this.autoUpdater.on('error', error => {
      const message = error instanceof Error ? error.message : String(error)
      this.log('[ModelibrDesktop][update] Error', { error: message })
      this.setState({ status: 'error', error: message })
    })
  }

  async check() {
    // electron-updater only works on packaged builds with update metadata.
    if (!this.isPackaged) {
      this.setState({ status: 'up-to-date' })
      return
    }

    this._wire()
    this.setState({ status: 'checking', error: null })

    try {
      await this.autoUpdater.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log('[ModelibrDesktop][update] Check failed', { error: message })
      this.setState({ status: 'error', error: message })
    }
  }

  // The "Download update" button: start pulling the available build down. On
  // unsigned macOS the download can error — fall back to the releases page so the
  // user can grab the installer manually.
  async download() {
    this._wire()
    this.setState({ status: 'downloading', percent: 0, error: null })
    try {
      await this.autoUpdater.downloadUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log('[ModelibrDesktop][update] Download failed', { error: message })
      this.setState({ status: 'error', error: message })
      this.openExternal(this.releaseUrl)
    }
  }

  // The "Restart & Install" button: install a downloaded build, otherwise open
  // the releases page (covers unsigned macOS and the "not downloaded yet" case).
  install() {
    if (this.state.status === 'downloaded') {
      try {
        this.autoUpdater.quitAndInstall()
        return
      } catch (error) {
        this.log('[ModelibrDesktop][update] quitAndInstall failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.openExternal(this.releaseUrl)
  }
}
