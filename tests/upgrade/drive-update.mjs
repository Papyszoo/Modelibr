// Drives the host's *in-app* updater headlessly, over the Chrome DevTools
// Protocol. The host is a tray app that never quits when its window closes
// (main.js: window-all-closed is a no-op), so a CI job can't trigger an install
// by killing/closing it — autoInstallOnAppQuit only runs on a real app.quit().
// Instead we connect to the running app's status window and call the same update
// IPC the tray buttons use:
//
//   1. poll window.modelibr.getUpdate() until status === 'downloaded'
//      (electron-updater downloads from the live GitHub release feed),
//   2. call window.modelibr.openUpdate() → install() → quitAndInstall(), which
//      installs the new version and relaunches it.
//
// Launch the app with --remote-debugging-port=9222 first. Used by the
// upgrade-test "self-update" job on Windows + Linux (macOS can't self-update
// while unsigned).

import { chromium } from 'playwright-core'

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222'
const TIMEOUT_MS = Number(process.env.UPDATE_TIMEOUT_MS || 600000) // 10 min
const POLL_MS = 5000

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Find the page that actually exposes the update bridge (the status window).
async function findUpdatePage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const hasBridge = await page
        .evaluate(() => typeof window.modelibr?.getUpdate === 'function')
        .catch(() => false)
      if (hasBridge) return page
    }
  }
  return null
}

async function main() {
  console.log(`[drive-update] connecting to ${CDP_URL}`)
  const browser = await chromium.connectOverCDP(CDP_URL)

  let page = null
  for (let i = 0; i < 30 && !page; i++) {
    page = await findUpdatePage(browser)
    if (!page) await sleep(1000)
  }
  if (!page) {
    throw new Error('could not find a window exposing window.modelibr.getUpdate over CDP')
  }

  const deadline = Date.now() + TIMEOUT_MS
  let state = null
  while (Date.now() < deadline) {
    state = await page.evaluate(() => window.modelibr.getUpdate()).catch(() => null)
    console.log(`[drive-update] update state: ${JSON.stringify(state)}`)
    if (state?.status === 'downloaded') break
    if (state?.status === 'error') {
      throw new Error(`updater reported an error: ${state.error ?? 'unknown'}`)
    }
    await sleep(POLL_MS)
  }

  if (state?.status !== 'downloaded') {
    throw new Error(`update was not downloaded before timeout (last status: ${state?.status ?? 'none'})`)
  }

  console.log('[drive-update] downloaded — triggering install (quitAndInstall + relaunch)')
  // This quits the app, so the evaluate / connection won't return cleanly — that's
  // expected. The workflow then waits for the relaunched (new) version on :3010.
  await page.evaluate(() => window.modelibr.openUpdate()).catch(() => {})
  await browser.close().catch(() => {})
  console.log('[drive-update] install triggered')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('[drive-update] FAIL:', error.message || error)
    process.exit(1)
  })
