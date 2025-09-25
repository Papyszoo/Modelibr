import { useRef, Suspense } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Box } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

// Separate components for each model type to avoid conditional hooks
function OBJModel({ modelUrl }) {
  const meshRef = useRef()

  // Rotate the model slowly
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
    }
  })

  const model = useLoader(OBJLoader, modelUrl)

  if (model) {
    // Apply a basic TSL-style material with enhanced properties
    model.traverse(child => {
      if (child.isMesh) {
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

  return <PlaceholderModel />
}

function GLTFModel({ modelUrl }) {
  const meshRef = useRef()

  // Rotate the model slowly
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
    }
  })

  const gltf = useLoader(GLTFLoader, modelUrl)
  const model = gltf?.scene

  if (model) {
    // Apply a basic TSL-style material with enhanced properties
    model.traverse(child => {
      if (child.isMesh) {
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

  return <PlaceholderModel />
}

function PlaceholderModel() {
  const meshRef = useRef()

  // Rotate the model slowly
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
    }
  })

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

function Model({ modelUrl, fileExtension }) {
  return (
    <Suspense fallback={<PlaceholderModel />}>
      {fileExtension === 'obj' && <OBJModel modelUrl={modelUrl} />}
      {(fileExtension === 'gltf' || fileExtension === 'glb') && (
        <GLTFModel modelUrl={modelUrl} />
      )}
      {!['obj', 'gltf', 'glb'].includes(fileExtension) && <PlaceholderModel />}
    </Suspense>
  )
}

export default Model
