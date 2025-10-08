import { Suspense, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stage, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { GeometryType } from './GeometrySelector'
import { TexturePackDto } from '../../../types'
import TexturedGeometry from './TexturedGeometry'
import LoadingPlaceholder from '../../../components/LoadingPlaceholder'
import './TexturePreviewPanel.css'

interface TexturePreviewPanelProps {
  texturePack: TexturePackDto
}

function TexturePreviewPanel({ texturePack }: TexturePreviewPanelProps) {
  const geometryNames = {
    box: 'Cube',
    sphere: 'Sphere',
    cylinder: 'Cylinder',
    torus: 'Torus',
  }

  // Use state to track the current geometry type
  // Note: This fixes a circular dependency issue where we previously tried to
  // reference `controls.type` inside the useControls hook definition itself.
  // By using useState and useEffect, we properly separate the control state
  // from the geometry-specific parameter hooks.
  const [currentGeometryType, setCurrentGeometryType] =
    useState<GeometryType>('box')

  // Base controls - always present
  const baseControls = useControls('Geometry', {
    type: {
      value: 'box' as GeometryType,
      options: {
        Cube: 'box' as GeometryType,
        Sphere: 'sphere' as GeometryType,
        Cylinder: 'cylinder' as GeometryType,
        Torus: 'torus' as GeometryType,
      },
      label: 'Geometry Type',
    },
    scale: {
      value: 1,
      min: 0.5,
      max: 3,
      step: 0.1,
      label: 'Scale',
    },
    rotationSpeed: {
      value: 0.01,
      min: 0,
      max: 0.05,
      step: 0.001,
      label: 'Rotation Speed',
    },
    wireframe: {
      value: false,
      label: 'Wireframe',
    },
  })

  // Update current geometry type when base controls change
  useEffect(() => {
    setCurrentGeometryType(baseControls.type)
  }, [baseControls.type])

  // Geometry-specific controls based on current type
  const cubeControls = useControls(
    'Cube Parameters',
    {
      cubeSize: {
        value: 2,
        min: 0.5,
        max: 4,
        step: 0.1,
        label: 'Cube Size',
      },
    },
    { collapsed: currentGeometryType !== 'box' }
  )

  const sphereControls = useControls(
    'Sphere Parameters',
    {
      sphereRadius: {
        value: 1.2,
        min: 0.5,
        max: 3,
        step: 0.1,
        label: 'Sphere Radius',
      },
      sphereSegments: {
        value: 64,
        min: 8,
        max: 128,
        step: 8,
        label: 'Sphere Segments',
      },
    },
    { collapsed: currentGeometryType !== 'sphere' }
  )

  const cylinderControls = useControls(
    'Cylinder Parameters',
    {
      cylinderRadius: {
        value: 1,
        min: 0.3,
        max: 2,
        step: 0.1,
        label: 'Cylinder Radius',
      },
      cylinderHeight: {
        value: 2,
        min: 0.5,
        max: 4,
        step: 0.1,
        label: 'Cylinder Height',
      },
    },
    { collapsed: currentGeometryType !== 'cylinder' }
  )

  const torusControls = useControls(
    'Torus Parameters',
    {
      torusRadius: {
        value: 1,
        min: 0.5,
        max: 2,
        step: 0.1,
        label: 'Torus Radius',
      },
      torusTube: {
        value: 0.4,
        min: 0.1,
        max: 0.8,
        step: 0.05,
        label: 'Tube Thickness',
      },
    },
    { collapsed: currentGeometryType !== 'torus' }
  )

  // Combine all controls into a single object
  const controls = {
    ...baseControls,
    ...cubeControls,
    ...sphereControls,
    ...cylinderControls,
    ...torusControls,
  }

  return (
    <div className="texture-preview-panel">
      <div className="preview-header">
        <h3 className="preview-title">
          {geometryNames[controls.type]} Preview
        </h3>
        <div className="preview-info">
          <span className="info-label">Textures Applied:</span>
          <span className="info-value">{texturePack.textureCount}</span>
        </div>
      </div>

      <div className="preview-canvas-container">
        <Canvas
          camera={{ position: [4, 3, 4], fov: 50 }}
          shadows
          className="texture-preview-canvas"
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
          }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          {/* Stage provides automatic lighting, shadows, and camera positioning */}
          <Stage
            intensity={0.5}
            environment="city"
            shadows={{ type: 'accumulative', bias: -0.001 }}
            adjustCamera={2.5}
          >
            <Suspense fallback={<LoadingPlaceholder />}>
              <TexturedGeometry
                geometryType={controls.type}
                texturePack={texturePack}
                geometryParams={controls}
              />
            </Suspense>
          </Stage>

          {/* Controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxDistance={50}
            minDistance={0.1}
          />
        </Canvas>
      </div>

      <div className="preview-hint">
        <i className="pi pi-info-circle"></i>
        Use mouse to rotate, zoom, and pan the view. Use the controls panel on
        the right to adjust geometry settings.
      </div>
    </div>
  )
}

export default TexturePreviewPanel
