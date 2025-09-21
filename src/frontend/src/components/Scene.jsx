import { Suspense } from 'react'
import { OrbitControls } from '@react-three/drei'
import Model from './Model'
import LoadingPlaceholder from './LoadingPlaceholder'
import ApiClient from '../services/ApiClient'

function Scene({ model }) {
  // Find the first renderable file
  const renderableFile = model.files?.find(f => f.isRenderable) || model.files?.[0]
  
  if (!renderableFile) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="gray" />
      </mesh>
    )
  }
  
  const fileExtension = renderableFile.originalFileName.split('.').pop().toLowerCase()
  const modelUrl = ApiClient.getFileUrl(renderableFile.id)

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

export default Scene