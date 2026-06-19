import './ScriptPreview.css'

import { Component, type ReactNode, useEffect, useRef, useState } from 'react'
import * as THREE_CORE from 'three'
import * as TSL from 'three/tsl'
import * as THREE_GPU from 'three/webgpu'

import { transformUserSource } from '../utils/transformUserSource'

// Merge core three with the WebGPU/node entry so user code can reach both node
// materials (e.g. MeshBasicNodeMaterial) and classic ones via one `THREE`.
const THREE = Object.assign({}, THREE_CORE, THREE_GPU) as typeof THREE_CORE &
  typeof THREE_GPU

interface ScriptScenePreviewProps {
  language: string
  content: string
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

function SceneRunner({ content }: { content: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE_GPU.WebGPURenderer | null = null
    let disposed = false
    let raf = 0

    // 1. Build the user's material/scene exactly once, guarded.
    let userValue: unknown
    try {
      const factory = new Function(
        '__THREE',
        '__TSL',
        transformUserSource(content)
      )
      userValue = factory(THREE, TSL)
    } catch (err) {
      setError(`Failed to run script: ${(err as Error).message}`)
      return
    }

    const material =
      userValue && (userValue as { isMaterial?: boolean }).isMaterial
        ? (userValue as THREE_CORE.Material)
        : null

    if (!material && typeof userValue !== 'function') {
      setError(
        'Preview expects the script to `export default` a THREE material.'
      )
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 3)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(2, 3, 4)
    scene.add(dir)

    let mesh: THREE_CORE.Mesh | null = null
    if (material) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), material)
      scene.add(mesh)
    }

    setError(null)

    // 2. Init the renderer (WebGPU, falling back to WebGL2) then animate.
    ;(async () => {
      try {
        renderer = new THREE_GPU.WebGPURenderer({ canvas, antialias: true })
        renderer.setClearColor(0x101015, 1)
        await renderer.init()
        if (disposed) return

        // Allow a custom-scene setup function (`export default ({...}) => {}`).
        if (typeof userValue === 'function') {
          ;(userValue as (ctx: unknown) => void)({
            THREE,
            TSL,
            scene,
            camera,
            renderer,
          })
        }

        const render = async () => {
          if (disposed) {
            raf = 0
            return
          }
          // Keep the loop alive while paused so Play can resume it; just skip
          // the work. (User code already ran once at build — nothing runs here.)
          if (!pausedRef.current) {
            const w = canvas.clientWidth || 1
            const h = canvas.clientHeight || 1
            if (canvas.width !== w || canvas.height !== h) {
              renderer!.setSize(w, h, false)
              camera.aspect = w / h
              camera.updateProjectionMatrix()
            }
            if (mesh) mesh.rotation.y += 0.01
            try {
              await renderer!.renderAsync(scene, camera)
            } catch (err) {
              setError(`Render error: ${(err as Error).message}`)
              return
            }
          }
          raf = requestAnimationFrame(() => void render())
        }
        void render()
      } catch (err) {
        if (!disposed)
          setError(`Could not start 3D preview: ${(err as Error).message}`)
      }
    })()

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      mesh?.geometry.dispose()
      material?.dispose()
      renderer?.dispose()
    }
  }, [content])

  return (
    <div className="script-preview" data-testid="script-preview">
      <div className="script-preview-toolbar">
        <span className="script-preview-label">Scene preview</span>
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
      <div className="script-preview-canvas-wrap">
        <canvas ref={canvasRef} className="script-preview-canvas" />
        {error && (
          <pre
            className="script-preview-error"
            data-testid="script-preview-error"
          >
            {error}
          </pre>
        )}
      </div>
    </div>
  )
}

export function ScriptScenePreview({ content }: ScriptScenePreviewProps) {
  // The runner rebuilds (dispose + re-run user code) whenever content changes;
  // the boundary is a backstop for any render-time throw it can't catch itself.
  return (
    <PreviewErrorBoundary>
      <SceneRunner content={content} />
    </PreviewErrorBoundary>
  )
}
