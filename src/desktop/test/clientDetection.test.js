import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  clientInstallCandidates,
  detectInstalledClientAt,
} from '../src/clientDetection.js'

test('windows candidates use LOCALAPPDATA\\Programs and Program Files', () => {
  const candidates = clientInstallCandidates(
    'win32',
    { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PROGRAMFILES: 'C:\\Program Files' },
    'C:\\Users\\me'
  )
  assert.ok(
    candidates.some(c => c.includes('Programs') && c.endsWith('Modelibr Client.exe')),
    'expected a %LOCALAPPDATA%\\Programs\\Modelibr Client\\Modelibr Client.exe candidate'
  )
  assert.ok(candidates.some(c => c.includes('Program Files')))
})

test('macOS candidates include /Applications and ~/Applications', () => {
  const candidates = clientInstallCandidates('darwin', {}, '/Users/me')
  assert.deepEqual(candidates, [
    '/Applications/Modelibr Client.app',
    '/Users/me/Applications/Modelibr Client.app',
  ])
})

test('linux candidates probe /opt', () => {
  const candidates = clientInstallCandidates('linux', {}, '/home/me')
  assert.ok(candidates.every(c => c.startsWith('/opt/')))
})

test('detectInstalledClientAt finds the first existing candidate', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-client-'))
  try {
    const present = path.join(dir, 'Modelibr Client')
    await fs.writeFile(present, 'binary')
    const missing = path.join(dir, 'nope')

    const found = await detectInstalledClientAt([missing, present])
    assert.equal(found.installed, true)
    assert.equal(found.launchPath, present)

    const none = await detectInstalledClientAt([missing])
    assert.equal(none.installed, false)
    assert.equal(none.launchPath, null)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
