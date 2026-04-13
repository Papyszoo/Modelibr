import './EnvironmentMapPreviewCanvas.css'

import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import {
  type CubeTexture,
  CubeTextureLoader,
  type DataTexture,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three-stdlib'

import { type EnvironmentMapPreviewOption } from '@/features/environment-map/utils/environmentMapUtils'
import { CanvasErrorBoundary } from '@/features/model-viewer/components/CanvasErrorBoundary'

type LoadedEnvironmentTexture = Texture | CubeTexture | DataTexture

interface EnvironmentMapPreviewCanvasProps {
  option: EnvironmentMapPreviewOption | null
}

function ReflectiveScene({
  environmentTexture,
}: {
  environmentTexture: LoadedEnvironmentTexture
}) {
  return (
    <>
      <Environment map={environmentTexture} background />

      <group position={[0, -0.02, 0]}>
        <mesh castShadow position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.34, 128, 128]} />
          <meshStandardMaterial
            color="#ffffff"
            metalness={1}
            roughness={0.05}
          />
        </mesh>
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.25}
        minDistance={1.7}
        maxDistance={8}
      />
    </>
  )
}

function getExtension(fileName?: string | null, assetUrl?: string | null) {
  const source = fileName || assetUrl || ''
  const withoutQuery = source.split('?')[0]
  const extension = withoutQuery.split('.').pop()?.toLowerCase()
  return extension || ''
}

export function EnvironmentMapPreviewCanvas({
  option,
}: EnvironmentMapPreviewCanvasProps) {
  const [environmentTexture, setEnvironmentTexture] =
    useState<LoadedEnvironmentTexture | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const previousTextureRef = useRef<LoadedEnvironmentTexture | null>(null)

  useEffect(() => {
    let cancelled = false

    const disposeTexture = (texture: LoadedEnvironmentTexture | null) => {
      texture?.dispose()
    }

    async function loadEnvironment() {
      if (!option) {
        disposeTexture(previousTextureRef.current)
        previousTextureRef.current = null
        setEnvironmentTexture(null)
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setEnvironmentTexture(null)

      const handleLoadedTexture = (texture: LoadedEnvironmentTexture) => {
        if (cancelled) {
          disposeTexture(texture)
          return
        }

        disposeTexture(previousTextureRef.current)
        previousTextureRef.current = texture
        setEnvironmentTexture(texture)
        setLoading(false)
      }

      const handleError = () => {
        if (cancelled) {
          return
        }

        disposeTexture(previousTextureRef.current)
        previousTextureRef.current = null
        setEnvironmentTexture(null)
        setLoading(false)
        setError('Unable to load this environment source.')
      }

      if (option.cubeFaceUrls) {
        const faces = [
          option.cubeFaceUrls.px,
          option.cubeFaceUrls.nx,
          option.cubeFaceUrls.py,
          option.cubeFaceUrls.ny,
          option.cubeFaceUrls.pz,
          option.cubeFaceUrls.nz,
        ]

        if (faces.some(face => !face)) {
          handleError()
          return
        }

        new CubeTextureLoader().load(
          faces as string[],
          texture => handleLoadedTexture(texture),
          undefined,
          handleError
        )
        return
      }

      if (!option.assetUrl) {
        handleError()
        return
      }

      const extension = getExtension(option.fileName, option.assetUrl)

      if (extension === 'hdr') {
        new RGBELoader().load(
          option.assetUrl,
          texture => {
            texture.mapping = EquirectangularReflectionMapping
            handleLoadedTexture(texture)
          },
          undefined,
          handleError
        )
        return
      }

      if (extension === 'exr') {
        new EXRLoader().load(
          option.assetUrl,
          texture => {
            texture.mapping = EquirectangularReflectionMapping
            handleLoadedTexture(texture)
          },
          undefined,
          handleError
        )
        return
      }

      new TextureLoader().load(
        option.assetUrl,
        texture => {
          texture.mapping = EquirectangularReflectionMapping
          texture.colorSpace = SRGBColorSpace
          handleLoadedTexture(texture)
        },
        undefined,
        handleError
      )
    }

    void loadEnvironment()

    return () => {
      cancelled = true
    }
  }, [option])

  useEffect(() => {
    return () => {
      previousTextureRef.current?.dispose()
      previousTextureRef.current = null
    }
  }, [])

  if (!option) {
    return (
      <div className="environment-map-preview-placeholder">
        <i className="pi pi-globe" />
        <span>No preview available</span>
      </div>
    )
  }

  return (
    <div className="environment-map-preview-canvas-shell">
      {loading ? (
        <div className="environment-map-preview-overlay">
          <i className="pi pi-spin pi-spinner" />
          <span>Loading environment…</span>
        </div>
      ) : null}

      {error || (!loading && !environmentTexture) ? (
        <div className="environment-map-preview-placeholder">
          <i className="pi pi-exclamation-triangle" />
          <span>{error ?? 'Preview unavailable'}</span>
        </div>
      ) : environmentTexture ? (
        <CanvasErrorBoundary>
          <Canvas
            key={option.key}
            className="environment-map-preview-canvas"
            camera={{ position: [0, 0.08, 3.8], fov: 40 }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
            }}
            dpr={Math.min(window.devicePixelRatio || 1, 2)}
          >
            <ReflectiveScene environmentTexture={environmentTexture} />
          </Canvas>
        </CanvasErrorBoundary>
      ) : (
        <div className="environment-map-preview-canvas" />
      )}
    </div>
  )
}
