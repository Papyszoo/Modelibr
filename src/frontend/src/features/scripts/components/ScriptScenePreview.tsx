import './ScriptPreview.css'

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as THREE_CORE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import * as TSL from 'three/tsl'
import * as THREE_GPU from 'three/webgpu'

import { prefersWebGLFallback } from '@/shared/three/createWebGPURenderer'
import { safeLoadingManager } from '@/shared/three/safeLoadingManager'
import { type PreviewGeometry } from '@/stores/scriptPreviewStore'
import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'

import { transformUserSource } from '../utils/transformUserSource'
import { PreviewLayoutToggle } from './PreviewLayoutToggle'

// Merge core three with the WebGPU/node entry so user code can reach both node
// materials (e.g. MeshBasicNodeMaterial) and classic ones via one `THREE`.
const THREE = Object.assign({}, THREE_CORE, THREE_GPU) as typeof THREE_CORE &
  typeof THREE_GPU

interface ScriptScenePreviewProps {
  /** Snapshot of the source to run (updated only on Run, never on keystroke). */
  source: string
  geometry: PreviewGeometry
  /** When set, the material is applied to this model instead of a primitive. */
  modelUrl?: string
  modelExtension?: string
  /** Re-snapshots the editor content into the preview. */
  onRun: () => void
}

type Backend = 'WebGPU' | 'WebGL2'

/**
 * Reports whether the WebGPU renderer actually initialised a WebGPU backend or
 * fell back to WebGL2, so the header can show which is live.
 */
function BackendReporter({ onBackend }: { onBackend: (b: Backend) => void }) {
  const gl = useThree(s => s.gl)
  useEffect(() => {
    const backend = (
      gl as unknown as {
        backend?: { isWebGPUBackend?: boolean; constructor?: { name?: string } }
      }
    ).backend
    const isWebGPU = !!(
      backend &&
      (backend.isWebGPUBackend || backend.constructor?.name === 'WebGPUBackend')
    )
    onBackend(isWebGPU ? 'WebGPU' : 'WebGL2')
  }, [gl, onBackend])
  return null
}

type Compiled =
  | { kind: 'material'; material: THREE_CORE.Material }
  | { kind: 'setup'; setup: (ctx: unknown) => void }
  | { kind: 'error'; message: string }

/** Runs the user source once and classifies the result. No GL needed here. */
function compileUserSource(source: string): Compiled {
  if (!source.trim()) {
    return { kind: 'error', message: 'Press Run to render this script.' }
  }
  let value: unknown
  try {
    const factory = new Function(
      '__THREE',
      '__TSL',
      transformUserSource(source)
    )
    value = factory(THREE, TSL)
  } catch (err) {
    return {
      kind: 'error',
      message: `Failed to run script: ${(err as Error).message}`,
    }
  }
  if (value && (value as { isMaterial?: boolean }).isMaterial) {
    return { kind: 'material', material: value as THREE_CORE.Material }
  }
  if (typeof value === 'function') {
    return { kind: 'setup', setup: value as (ctx: unknown) => void }
  }
  return {
    kind: 'error',
    message:
      'Preview expects the script to `export default` a THREE material (or a setup function).',
  }
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="script-preview-unsupported">
          <i className="pi pi-exclamation-triangle" aria-hidden="true" />
          <p>Preview crashed: {this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}

function PrimitiveMesh({
  geometry,
  material,
  rotationSpeed,
  paused,
}: {
  geometry: PreviewGeometry
  material: THREE_CORE.Material
  rotationSpeed: number
  paused: boolean
}) {
  const ref = useRef<THREE_CORE.Mesh>(null)
  useFrame(() => {
    if (ref.current && !paused) ref.current.rotation.y += rotationSpeed
  })
  return (
    <mesh ref={ref}>
      {geometry === 'sphere' && <sphereGeometry args={[1, 48, 48]} />}
      {geometry === 'box' && <boxGeometry args={[1.4, 1.4, 1.4]} />}
      {geometry === 'plane' && <planeGeometry args={[2, 2]} />}
      {geometry === 'cylinder' && (
        <cylinderGeometry args={[0.9, 0.9, 1.8, 48]} />
      )}
      {geometry === 'torus' && <torusGeometry args={[0.85, 0.35, 32, 64]} />}
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function ModelMesh({
  url,
  extension,
  material,
  rotationSpeed,
  paused,
}: {
  url: string
  extension: string
  material: THREE_CORE.Material
  rotationSpeed: number
  paused: boolean
}) {
  const group = useRef<THREE_CORE.Group>(null)
  useFrame(() => {
    if (group.current && !paused) group.current.rotation.y += rotationSpeed
  })

  const loader =
    extension === 'obj'
      ? OBJLoader
      : extension === 'fbx'
        ? FBXLoader
        : GLTFLoader
  const loaded = useLoader(loader, url, l => {
    l.manager = safeLoadingManager
  })

  const object = useMemo(() => {
    const raw = loaded as unknown as { scene?: THREE_CORE.Object3D }
    const root = (raw.scene ?? (loaded as THREE_CORE.Object3D)).clone()

    // Apply the user material to every mesh.
    root.traverse(child => {
      if ((child as THREE_CORE.Mesh).isMesh) {
        ;(child as THREE_CORE.Mesh).material = material
      }
    })

    // Normalise to ~2 units and centre on the origin.
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    root.scale.multiplyScalar(2 / maxDim)
    const scaledBox = new THREE.Box3().setFromObject(root)
    const center = scaledBox.getCenter(new THREE.Vector3())
    root.position.sub(center)
    return root
  }, [loaded, material])

  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  )
}

/** Runs a user setup function against the live scene and cleans up after itself. */
function SetupRunner({ setup }: { setup: (ctx: unknown) => void }) {
  const { scene, camera, gl } = useThree()
  useEffect(() => {
    const before = new Set(scene.children)
    try {
      setup({ THREE, TSL, scene, camera, renderer: gl })
    } catch (err) {
      console.error('Scene setup failed:', err)
    }
    return () => {
      // Remove whatever the setup added so a re-run starts clean.
      for (const child of [...scene.children]) {
        if (!before.has(child)) scene.remove(child)
      }
    }
  }, [setup, scene, camera, gl])
  return null
}

function SceneContents({
  compiled,
  geometry,
  modelUrl,
  modelExtension,
  paused,
}: {
  compiled: Compiled
  geometry: PreviewGeometry
  modelUrl?: string
  modelExtension?: string
  paused: boolean
}) {
  const settings = useViewerSettingsStore(s => s.settings)
  const rotationSpeed = settings.modelRotationSpeed

  return (
    <>
      <color attach="background" args={['#101015']} />
      <ambientLight intensity={settings.ambientIntensity} />
      <directionalLight
        position={[2, 3, 4]}
        intensity={settings.directionalIntensity}
      />

      {compiled.kind === 'setup' && <SetupRunner setup={compiled.setup} />}

      {compiled.kind === 'material' && (
        <Suspense fallback={null}>
          {modelUrl && modelExtension ? (
            <ModelMesh
              url={modelUrl}
              extension={modelExtension}
              material={compiled.material}
              rotationSpeed={rotationSpeed}
              paused={paused}
            />
          ) : (
            <PrimitiveMesh
              geometry={geometry}
              material={compiled.material}
              rotationSpeed={rotationSpeed}
              paused={paused}
            />
          )}
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        rotateSpeed={settings.orbitSpeed}
        zoomSpeed={settings.zoomSpeed}
        panSpeed={settings.panSpeed}
        maxDistance={50}
        minDistance={0.2}
      />
    </>
  )
}

// R3F v9 accepts an async gl factory; we use it to spin up a WebGPU renderer so
// TSL / node materials work. (This integration needs a real GPU — it can't be
// exercised in jsdom/CI; the error boundary is the backstop if it fails.)
async function createWebGpuRenderer(
  props: ConstructorParameters<typeof THREE_GPU.WebGPURenderer>[0]
): Promise<THREE_GPU.WebGPURenderer> {
  const renderer = new THREE_GPU.WebGPURenderer({
    ...props,
    forceWebGL: props.forceWebGL ?? prefersWebGLFallback(),
  })
  await renderer.init()
  return renderer
}

export function ScriptScenePreview({
  source,
  geometry,
  modelUrl,
  modelExtension,
  onRun,
}: ScriptScenePreviewProps) {
  const [paused, setPaused] = useState(false)
  const [backend, setBackend] = useState<Backend | null>(null)

  const compiled = useMemo(() => compileUserSource(source), [source])

  // Dispose a previously-built material when the source (and thus material)
  // changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (compiled.kind === 'material') compiled.material.dispose()
    }
  }, [compiled])

  return (
    <PreviewErrorBoundary>
      <div className="script-preview" data-testid="script-preview">
        <div className="script-preview-toolbar">
          <div className="script-preview-controls">
            <button
              type="button"
              className="script-preview-toggle"
              onClick={onRun}
              data-testid="script-run"
            >
              <i className="pi pi-play" />
              Run
            </button>
            <button
              type="button"
              className="script-preview-toggle"
              onClick={() => setPaused(p => !p)}
              data-testid="script-preview-toggle"
            >
              <i className={`pi ${paused ? 'pi-play' : 'pi-pause'}`} />
              {paused ? 'Play' : 'Pause'}
            </button>
          </div>
          <div className="script-preview-controls">
            {backend && (
              <span
                className="script-preview-backend"
                data-testid="script-preview-backend"
                title="Active render backend"
              >
                {backend}
              </span>
            )}
            <PreviewLayoutToggle />
          </div>
        </div>
        <div className="script-preview-canvas-wrap">
          {compiled.kind === 'error' ? (
            <pre
              className="script-preview-error"
              data-testid="script-preview-error"
            >
              {compiled.message}
            </pre>
          ) : (
            <Canvas
              className="script-preview-canvas"
              camera={{ position: [0, 0, 3.2], fov: 50 }}
              // Pause = stop the render loop entirely (freezes rotation AND any
              // time-driven TSL animation); "demand" still re-renders on orbit.
              frameloop={paused ? 'demand' : 'always'}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              gl={createWebGpuRenderer as any}
            >
              <BackendReporter onBackend={setBackend} />
              <SceneContents
                compiled={compiled}
                geometry={geometry}
                modelUrl={modelUrl}
                modelExtension={modelExtension}
                paused={paused}
              />
            </Canvas>
          )}
        </div>
      </div>
    </PreviewErrorBoundary>
  )
}
