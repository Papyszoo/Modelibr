import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { UpdateManager } from '../src/updateManager.js'

// A stand-in for electron-updater's autoUpdater: an EventEmitter with spy methods
// and the two flags the manager is expected to flip off. Lets us drive the update
// lifecycle deterministically without Electron or a real GitHub feed.
function makeFakeAutoUpdater(overrides = {}) {
  const au = new EventEmitter()
  au.autoDownload = true
  au.autoInstallOnAppQuit = true
  au.calls = { checkForUpdates: 0, downloadUpdate: 0, quitAndInstall: 0 }
  au.checkForUpdates = async () => {
    au.calls.checkForUpdates++
  }
  au.downloadUpdate = async () => {
    au.calls.downloadUpdate++
  }
  au.quitAndInstall = () => {
    au.calls.quitAndInstall++
  }
  return Object.assign(au, overrides)
}

function makeManager(overrides = {}) {
  const au = overrides.autoUpdater ?? makeFakeAutoUpdater()
  const opened = []
  const mgr = new UpdateManager({
    currentVersion: '0.1.0',
    isPackaged: true,
    openExternal: url => opened.push(url),
    log: () => {},
    ...overrides,
    autoUpdater: au,
  })
  return { mgr, au, opened }
}

test('check() opts out of background download and install-on-quit', async () => {
  const { mgr, au } = makeManager()
  await mgr.check()
  assert.equal(au.autoDownload, false, 'autoDownload must be disabled')
  assert.equal(au.autoInstallOnAppQuit, false, 'autoInstallOnAppQuit must be disabled')
  assert.equal(au.calls.checkForUpdates, 1)
})

test('check() is a no-op on an unpackaged (dev) build', async () => {
  const { mgr, au } = makeManager({ isPackaged: false })
  await mgr.check()
  assert.equal(mgr.state.status, 'up-to-date')
  assert.equal(au.calls.checkForUpdates, 0, 'must not hit the feed in dev')
})

test('an available update is surfaced but NOT downloaded automatically', async () => {
  const { mgr, au } = makeManager()
  await mgr.check()
  au.emit('update-available', { version: '0.2.0' })

  assert.equal(mgr.state.status, 'available')
  assert.equal(mgr.state.latestVersion, '0.2.0')
  assert.equal(au.calls.downloadUpdate, 0, 'nothing should download until the user asks')
})

test('update-not-available marks the app up to date', async () => {
  const { mgr, au } = makeManager()
  await mgr.check()
  au.emit('update-not-available', { version: '0.1.0' })
  assert.equal(mgr.state.status, 'up-to-date')
})

test('download() starts the download only when the user clicks, then tracks progress', async () => {
  const { mgr, au } = makeManager()
  await mgr.check()
  au.emit('update-available', { version: '0.2.0' })

  await mgr.download()
  assert.equal(au.calls.downloadUpdate, 1)
  assert.equal(mgr.state.status, 'downloading')

  au.emit('download-progress', { percent: 42.6 })
  assert.equal(mgr.state.percent, 43, 'progress is rounded')

  au.emit('update-downloaded', { version: '0.2.0' })
  assert.equal(mgr.state.status, 'downloaded')
  assert.equal(mgr.state.percent, 100)
})

test('download() falls back to the releases page when the download errors (e.g. unsigned macOS)', async () => {
  const au = makeFakeAutoUpdater({
    downloadUpdate: async () => {
      throw new Error('not signed')
    },
  })
  const { mgr, opened } = makeManager({ autoUpdater: au })
  await mgr.check()
  au.emit('update-available', { version: '0.2.0' })

  await mgr.download()
  assert.equal(mgr.state.status, 'error')
  assert.equal(opened.length, 1)
  assert.match(opened[0], /\/releases$/)
})

test('install() restarts into a downloaded build', async () => {
  const { mgr, au, opened } = makeManager()
  await mgr.check()
  au.emit('update-downloaded', { version: '0.2.0' })

  mgr.install()
  assert.equal(au.calls.quitAndInstall, 1)
  assert.equal(opened.length, 0, 'should restart, not open a browser')
})

test('install() opens the releases page when nothing is downloaded yet', async () => {
  const { mgr, au, opened } = makeManager()
  mgr.install()
  assert.equal(au.calls.quitAndInstall, 0)
  assert.equal(opened.length, 1)
  assert.match(opened[0], /\/releases$/)
})
