import net from 'net'

// True if `port` can be bound on the loopback interface right now.
export function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

// An OS-assigned free port on the loopback interface.
export function getEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// Returns `preferred` when it's free, otherwise an OS-assigned free port. Used
// at startup so a configured port that's already in use never blocks boot — the
// service just binds a free one instead (the saved preference is untouched and
// tried again next launch).
export async function resolveUsablePort(preferred) {
  if (await isPortFree(preferred)) {
    return preferred
  }
  return getEphemeralPort()
}
