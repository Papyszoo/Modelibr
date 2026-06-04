import fs from 'fs/promises'
import path from 'path'

const desktopRoot = path.resolve(process.cwd())
const repoRoot = path.resolve(desktopRoot, '..', '..')
const runtimeRoot = path.join(desktopRoot, 'build', 'runtime')

const frontendDistDir = path.join(repoRoot, 'src', 'frontend', 'dist')
const assetProcessorDir = path.join(repoRoot, 'src', 'asset-processor')

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function ensureExists(targetPath, label) {
  try {
    await fs.access(targetPath)
  } catch {
    throw new Error(`${label} not found at ${targetPath}`)
  }
}

async function copyDirectory(source, destination, { dereference = false } = {}) {
  await ensureExists(source, source)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { recursive: true, force: true, dereference })
}

async function copyFile(source, destination) {
  await ensureExists(source, source)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(source, destination)
}

async function stagePostgresRuntime() {
  const postgresRuntimeDir = process.env.MODELIBR_POSTGRES_RUNTIME_DIR?.trim()
  if (postgresRuntimeDir) {
    // Dereference symlinks: the bundled PostgreSQL libs are symlink chains
    // (libicuuc.so.60 -> .so.60.2) and the symlinks are lost when packaged
    // into the app, leaving initdb unable to load the exact referenced names.
    await copyDirectory(postgresRuntimeDir, path.join(runtimeRoot, 'postgres'), {
      dereference: true,
    })
    return
  }

  const postgresBinDir = requiredEnv('MODELIBR_POSTGRES_BIN_DIR')
  const postgresShareDir = requiredEnv('MODELIBR_POSTGRES_SHARE_DIR')
  const postgresLibDir = process.env.MODELIBR_POSTGRES_LIB_DIR?.trim()

  await copyDirectory(postgresBinDir, path.join(runtimeRoot, 'postgres', 'bin'))
  await copyDirectory(postgresShareDir, path.join(runtimeRoot, 'postgres', 'share'))

  if (postgresLibDir) {
    await copyDirectory(postgresLibDir, path.join(runtimeRoot, 'postgres', 'lib'))
  }
}

async function main() {
  await fs.rm(runtimeRoot, { recursive: true, force: true })
  await fs.mkdir(runtimeRoot, { recursive: true })

  await copyDirectory(frontendDistDir, path.join(runtimeRoot, 'frontend'))

  const webApiPublishDir = requiredEnv('MODELIBR_WEBAPI_PUBLISH_DIR')
  await copyDirectory(webApiPublishDir, path.join(runtimeRoot, 'webapi'))

  await copyDirectory(assetProcessorDir, path.join(runtimeRoot, 'asset-processor'))

  const nodeExecutable = requiredEnv('MODELIBR_NODE_EXECUTABLE')
  const nodeFileName = process.platform === 'win32' ? 'node.exe' : 'node'
  await copyFile(nodeExecutable, path.join(runtimeRoot, 'node', nodeFileName))

  await stagePostgresRuntime()

  console.log(`Staged native runtime at ${runtimeRoot}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
