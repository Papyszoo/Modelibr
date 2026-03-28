import { useWebDavStore } from '@/stores/webDavStore'
import { detectOS } from '@/utils/webdavUtils'

export function WebDavInstructions(): JSX.Element {
  const os = detectOS()
  const activeUrl = useWebDavStore(s => s.activeUrl)

  // Derive connection details from the store's active WebDAV URL.
  // Falls back to window.location if the store hasn't been initialised yet.
  let host = window.location.hostname
  let isHttps = window.location.protocol === 'https:'
  let port = window.location.port || (isHttps ? '443' : '80')
  let webDavBaseUrl = `${window.location.protocol}//${window.location.host}/modelibr`

  if (activeUrl) {
    try {
      const parsed = new URL(activeUrl)
      host = parsed.hostname
      isHttps = parsed.protocol === 'https:'
      port = parsed.port || (isHttps ? '443' : '80')
      webDavBaseUrl = `${activeUrl.replace(/\/+$/, '')}/modelibr`
    } catch {
      // keep fallback values
    }
  }

  const isStandardHttpPort = !isHttps && port === '80'
  const isStandardHttpsPort = isHttps && port === '443'
  const isStandardPort = isStandardHttpPort || isStandardHttpsPort

  // Build the Windows UNC path.
  // Mini-Redirector notation: \\host\share (port 80), \\host@PORT\share (HTTP non-standard),
  // \\host@SSL\share (port 443), \\host@SSL@PORT\share (HTTPS non-standard).
  let uncPath: string
  if (isStandardHttpPort) {
    uncPath = `\\\\${host}\\modelibr`
  } else if (isStandardHttpsPort) {
    uncPath = `\\\\${host}@SSL\\modelibr`
  } else if (isHttps) {
    uncPath = `\\\\${host}@SSL@${port}\\modelibr`
  } else {
    uncPath = `\\\\${host}@${port}\\modelibr`
  }

  if (os === 'windows') {
    return (
      <div className="webdav-instructions">
        {isHttps && (
          <div className="webdav-port-warning">
            <strong>
              ⚠ HTTPS requires a trusted SSL certificate on Windows
            </strong>
            <p>
              Windows WebClient refuses HTTPS WebDAV connections unless the
              server's certificate is trusted. A self-signed certificate will
              cause the <em>"Windows cannot access"</em> error.
            </p>
            <p>
              <strong>
                Option A — trust the certificate (one-time setup):
              </strong>
            </p>
            <ol>
              <li>
                In Modelibr Settings → WebDAV → <strong>SSL Certificate</strong>
                , click <em>Download SSL Certificate</em> (requires HTTP port to
                be configured). Or export it manually: open{' '}
                <code>{webDavBaseUrl}</code> in your browser → click the padlock
                → Certificate → Details → Copy to File.
              </li>
              <li>
                <strong>Windows:</strong> double-click the <code>.crt</code> →{' '}
                <em>Install Certificate</em> → <em>Local Machine</em> →{' '}
                <em>Trusted Root Certification Authorities</em>
                <br />
                <strong>macOS:</strong> double-click → open in{' '}
                <em>Keychain Access</em> → set trust to <em>Always Trust</em>
              </li>
              <li>
                Restart the <strong>WebClient</strong> service (Windows): run{' '}
                <code>net stop webclient && net start webclient</code> as
                Administrator
              </li>
            </ol>
            <p>
              <strong>
                Option B — use HTTP instead (recommended for local network):
              </strong>{' '}
              Add <code>WEBDAV_HTTP_PORT=80</code> to <code>.env</code> and
              restart Docker. HTTP on port 80 needs no certificate and no
              registry changes.
            </p>
          </div>
        )}

        <p>
          <strong>Map as network drive (Windows):</strong>
        </p>
        <ol>
          <li>
            Open <strong>File Explorer</strong>
          </li>
          <li>
            Right-click <strong>This PC</strong> →{' '}
            <strong>Map network drive...</strong>
          </li>
          <li>
            In the <strong>Folder</strong> field enter: <code>{uncPath}</code>
          </li>
          <li>
            Click <strong>Finish</strong>
          </li>
        </ol>

        <p>
          <strong>Or add as network location:</strong>
        </p>
        <ol>
          <li>
            Open <strong>File Explorer</strong>
          </li>
          <li>
            Right-click <strong>This PC</strong> →{' '}
            <strong>Add a network location...</strong>
          </li>
          <li>
            Click <strong>Next</strong> →{' '}
            <strong>Choose a custom network location</strong> →{' '}
            <strong>Next</strong>
          </li>
          <li>
            Enter: <code>{webDavBaseUrl}</code>
          </li>
          <li>
            Click <strong>Next</strong>, give it a name, and finish
          </li>
        </ol>

        {!isStandardPort && (
          <div className="webdav-port-warning">
            <strong>
              ⚠ Non-standard port — whitelist Modelibr as trusted WebDAV
              server:
            </strong>
            <p>
              Windows WebClient only connects to WebDAV on port 80 or 443 by
              default. To allow connections to other ports, add Modelibr to the
              trusted server list:
            </p>
            <ol>
              <li>
                Open <strong>Registry Editor</strong> (<code>regedit</code>)
              </li>
              <li>
                Navigate to:{' '}
                <code>
                  HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\WebClient\Parameters
                </code>
              </li>
              <li>
                Create or open the value <code>AuthForwardServerList</code>{' '}
                (type: <strong>REG_MULTI_SZ</strong>)
              </li>
              <li>
                Add one entry per line for each Modelibr hostname:{' '}
                <code>{host}</code>
              </li>
              <li>
                Restart the <strong>WebClient</strong> service: run{' '}
                <code>net stop webclient && net start webclient</code> as
                Administrator
              </li>
            </ol>
            <p>
              <code>AuthForwardServerList</code> whitelists specific servers
              rather than enabling HTTP globally, which is the safer approach.
              Wildcards are supported (e.g. <code>*.local</code>).
            </p>
            <p>
              Alternatively, expose Modelibr on port 80 (HTTP) or 443 (HTTPS)
              and no registry changes are needed.
            </p>
          </div>
        )}
      </div>
    )
  }

  if (os === 'macos') {
    return (
      <div className="webdav-instructions">
        <p>
          <strong>Connect in Finder (macOS):</strong>
        </p>
        <ol>
          <li>
            Open <strong>Finder</strong>
          </li>
          <li>
            Press <strong>⌘K</strong> (Go → Connect to Server)
          </li>
          <li>
            Enter: <code>{webDavBaseUrl}</code>
          </li>
          <li>
            Click <strong>Connect</strong>
          </li>
          <li>
            If prompted, select <strong>Guest</strong> (no authentication
            required)
          </li>
        </ol>
        <p className="webdav-hint">
          The WebDAV share will appear in the Finder sidebar under{' '}
          <strong>Locations</strong>.
        </p>
      </div>
    )
  }

  if (os === 'linux') {
    const davProtocol = isHttps ? 'davs' : 'dav'

    return (
      <div className="webdav-instructions">
        <p>
          <strong>Mount with GNOME Files / Nautilus (Linux):</strong>
        </p>
        <ol>
          <li>
            Open <strong>Files</strong> (Nautilus)
          </li>
          <li>
            Press <strong>Ctrl+L</strong> to open the location bar
          </li>
          <li>
            Enter:{' '}
            <code>
              {davProtocol}://{host}:{port}/modelibr
            </code>
          </li>
          <li>
            Press <strong>Enter</strong> and connect as{' '}
            <strong>Anonymous</strong>
          </li>
        </ol>

        <p>
          <strong>Or mount via command line (davfs2):</strong>
        </p>
        <pre className="webdav-code-block">
          {`sudo apt install davfs2
sudo mkdir -p /mnt/modelibr
sudo mount -t davfs ${webDavBaseUrl} /mnt/modelibr`}
        </pre>
      </div>
    )
  }

  // Unknown OS — show all options
  return (
    <div className="webdav-instructions">
      <p>Use a WebDAV client to connect to:</p>
      <code>{webDavBaseUrl}</code>
    </div>
  )
}
