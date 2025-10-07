import { Suspense } from 'react'
import { Dialog } from 'primereact/dialog'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GeometryType } from './GeometrySelector'
import { TexturePackDto } from '../../../types'
import TexturedGeometry from './TexturedGeometry'
import LoadingPlaceholder from '../../LoadingPlaceholder'
import './TexturePreviewDialog.css'

interface TexturePreviewDialogProps {
  visible: boolean
  geometryType: GeometryType
  texturePack: TexturePackDto
  onHide: () => void
}

function TexturePreviewDialog({
  visible,
  geometryType,
  texturePack,
  onHide,
}: TexturePreviewDialogProps) {
  const geometryNames = {
    box: 'Cube',
    sphere: 'Sphere',
    cylinder: 'Cylinder',
    torus: 'Torus',
  }

  return (
    <Dialog
      header={`Preview: ${texturePack.name} on ${geometryNames[geometryType]}`}
      visible={visible}
      onHide={onHide}
      modal
      className="texture-preview-dialog"
      style={{ width: '80vw', maxWidth: '1200px', height: '80vh' }}
      maximizable
    >
      <div className="texture-preview-container">
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
          {/* Lighting setup */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[10, 10, 5]}
            intensity={1.0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <pointLight position={[-10, -10, -10]} intensity={0.5} />
          <spotLight
            position={[0, 10, 0]}
            angle={0.3}
            penumbra={1}
            intensity={0.8}
            castShadow
          />

          {/* Textured Geometry */}
          <Suspense fallback={<LoadingPlaceholder />}>
            <TexturedGeometry
              geometryType={geometryType}
              texturePack={texturePack}
            />
          </Suspense>

          {/* Ground plane */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -2, 0]}
            receiveShadow
          >
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial
              color="#f0f0f0"
              metalness={0.0}
              roughness={0.8}
            />
          </mesh>

          {/* Controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            maxDistance={15}
            minDistance={2}
          />
        </Canvas>

        <div className="texture-preview-info">
          <div className="texture-preview-stats">
            <span className="stat-label">Textures Applied:</span>
            <span className="stat-value">{texturePack.textureCount}</span>
          </div>
          <p className="texture-preview-hint">
            <i className="pi pi-info-circle"></i>
            Use mouse to rotate, zoom, and pan the view
          </p>
        </div>
      </div>
    </Dialog>
  )
}

export default TexturePreviewDialog
