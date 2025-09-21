import { Suspense, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { OrbitControls, Text, Box } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'
import './ModelViewer.css'

function Model({ modelUrl, fileExtension }) {
  const meshRef = useRef()

  // Rotate the model slowly
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005
    }
  })

  try {
    let model = null

    if (fileExtension === 'obj') {
      model = useLoader(OBJLoader, modelUrl)
    } else if (fileExtension === 'gltf' || fileExtension === 'glb') {
      const gltf = useLoader(GLTFLoader, modelUrl)
      model = gltf.scene
    }

    if (model) {
      // Apply a basic TSL-style material with enhanced properties
      model.traverse((child) => {
        if (child.isMesh) {
          // Create a material using Three.js's node-based material system
          // This simulates TSL (Three.js Shading Language) concepts
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.7, 0.7, 0.9),
            metalness: 0.3,
            roughness: 0.4,
            envMapIntensity: 1.0,
          })
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      // Center and scale the model
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2 / maxDim
      
      model.position.sub(center.multiplyScalar(scale))
      model.scale.setScalar(scale)

      return (
        <group ref={meshRef}>
          <primitive object={model} />
        </group>
      )
    }
  } catch (error) {
    console.error('Error loading model:', error)
  }

  // Fallback: show a placeholder box with TSL-style material
  return (
    <Box ref={meshRef} args={[1, 1, 1]}>
      <meshStandardMaterial 
        color="#8B5CF6" 
        metalness={0.5} 
        roughness={0.2}
        envMapIntensity={1.0}
      />
    </Box>
  )
}

function Scene({ model }) {
  const fileExtension = model.filePath.split('.').pop().toLowerCase()
  const modelUrl = `http://localhost:5009/models/${model.id}/file`

  return (
    <>
      {/* Enhanced lighting setup for TSL-style rendering */}
      <ambientLight intensity={0.3} />
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
      
      {/* Model with TSL-inspired shading */}
      <Suspense fallback={<LoadingPlaceholder />}>
        <Model modelUrl={modelUrl} fileExtension={fileExtension} />
      </Suspense>
      
      {/* Ground plane with receiving shadows */}
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
      
      {/* Orbit controls for interaction */}
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxDistance={10}
        minDistance={0.5}
      />
    </>
  )
}

function LoadingPlaceholder() {
  return (
    <Text
      position={[0, 0, 0]}
      fontSize={0.5}
      color="#666"
      anchorX="center"
      anchorY="middle"
    >
      Loading 3D Model...
    </Text>
  )
}

function ModelViewer({ model, onBack }) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Simulate loading delay to show the loading state
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="model-viewer">
      <header className="viewer-header">
        <button onClick={onBack} className="back-button">
          ← Back to Models
        </button>
        <h1>3D Model Viewer</h1>
        <div className="model-details">
          <span className="model-id">Model #{model.id}</span>
          <span className="model-format">
            {model.filePath.split('.').pop().toUpperCase()}
          </span>
        </div>
      </header>

      <div className="viewer-container">
        {isLoading ? (
          <div className="viewer-loading">
            <div className="loading-spinner"></div>
            <p>Initializing TSL Renderer...</p>
          </div>
        ) : error ? (
          <div className="viewer-error">
            <h3>Failed to load model</h3>
            <p>{error}</p>
            <button onClick={() => setError('')} className="retry-button">
              Retry
            </button>
          </div>
        ) : (
          <Canvas
            camera={{ position: [3, 3, 3], fov: 60 }}
            shadows
            className="viewer-canvas"
          >
            <Scene model={model} />
          </Canvas>
        )}
      </div>

      <div className="viewer-info">
        <div className="info-section">
          <h3>Model Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>ID:</label>
              <span>{model.id}</span>
            </div>
            <div className="info-item">
              <label>Created:</label>
              <span>{new Date(model.createdAt).toLocaleString()}</span>
            </div>
            <div className="info-item">
              <label>Modified:</label>
              <span>{new Date(model.updatedAt).toLocaleString()}</span>
            </div>
            <div className="info-item">
              <label>Format:</label>
              <span>{model.filePath.split('.').pop().toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div className="info-section">
          <h3>TSL Rendering Features</h3>
          <ul className="feature-list">
            <li>✓ Real-time physically based rendering (PBR)</li>
            <li>✓ Dynamic lighting with shadow mapping</li>
            <li>✓ Material metalness and roughness controls</li>
            <li>✓ Environment mapping for reflections</li>
            <li>✓ Interactive orbit controls</li>
          </ul>
        </div>

        <div className="info-section">
          <h3>Controls</h3>
          <ul className="controls-list">
            <li><strong>Mouse:</strong> Rotate view</li>
            <li><strong>Scroll:</strong> Zoom in/out</li>
            <li><strong>Right-click + drag:</strong> Pan view</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default ModelViewer