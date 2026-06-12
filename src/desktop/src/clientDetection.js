import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const PRODUCT = 'Modelibr Client'

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  return null
}

// Pure: the default install locations to probe for a given platform. Split out
// from filesystem access so it can be unit-tested without a real install. `env`
// and `homedir` are injected for the same reason.
export function clientInstallCandidates(platform, env = process.env, homedir = os.homedir()) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local')
    const programFiles = env.PROGRAMFILES || 'C:\\Program Files'
    const exe = `${PRODUCT}.exe`
    // perMachine:false installs under %LOCALAPPDATA%\Programs by default; cover
    // the per-machine location too in case the user elevated the install.
    return [
      path.join(local, 'Programs', PRODUCT, exe),
      path.join(programFiles, PRODUCT, exe),
    ]
  }

  if (platform === 'darwin') {
    return [
      `/Applications/${PRODUCT}.app`,
      path.join(homedir, 'Applications', `${PRODUCT}.app`),
    ]
  }

  // Linux: .deb installs to /opt; AppImage has no fixed location, so AppImage
  // users may read as not-installed (best-effort).
  return [`/opt/${PRODUCT}/modelibr-client`, '/opt/modelibr-client/modelibr-client']
}

// Pure-ish: resolves the first existing candidate to a launch target.
export async function detectInstalledClientAt(candidates) {
  const launchPath = await firstExisting(candidates)
  return { installed: !!launchPath, launchPath }
}

// Best-effort detection of an installed Modelibr desktop client at its default
// install location. Returns the path to launch, or null. If the user installed
// to a custom directory this can miss — callers treat a miss as "offer install".
export async function detectInstalledClient() {
  return detectInstalledClientAt(clientInstallCandidates(process.platform))
}
