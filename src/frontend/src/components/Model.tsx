import { useRef, Suspense, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Box } from '@react-three/drei'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'
import LoadingPlaceholder from './LoadingPlaceholder'
import { useModelObject } from '../hooks/useModelObject'

// Separate components for each model type to avoid conditional hooks
function OBJModel({ modelUrl }: { modelUrl: string }) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)

  // Rotate the model slowly
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
    }
  })

  const model = useLoader(OBJLoader, modelUrl)

  useEffect(() => {
    if (model && !scaledRef.current) {
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

      // Center and scale the model - only once
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2 / maxDim

      model.position.sub(center.multiplyScalar(scale))
      model.scale.setScalar(scale)

      scaledRef.current = true
    }
  }, [model])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  if (model) {
    return (
      <group ref={meshRef}>
        <primitive object={model} />
      </group>
    )
  }

  return <LoadingPlaceholder />
}

function GLTFModel({ modelUrl }: { modelUrl: string }) {
  const meshRef = useRef<THREE.Group>(null)
  const { setModelObject } = useModelObject()
  const scaledRef = useRef(false)

  // Rotate the model slowly
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002
    }
  })

  const gltf = useLoader(GLTFLoader, modelUrl)
  const model = gltf?.scene

  useEffect(() => {
    if (model && !scaledRef.current) {
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

      // Center and scale the model - only once
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2 / maxDim

      model.position.sub(center.multiplyScalar(scale))
      model.scale.setScalar(scale)

      scaledRef.current = true
    }
  }, [model])

  useEffect(() => {
    if (model) {
      setModelObject(model)
    }
    return () => setModelObject(null)
  }, [model, setModelObject])

  if (model) {
    return (
      <group ref={meshRef}>
        <primitive object={model} />
      </group>
    )
  }

  return <LoadingPlaceholder />
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
    <Suspense fallback={<LoadingPlaceholder />}>
      {fileExtension === 'obj' && <OBJModel modelUrl={modelUrl} />}
      {(fileExtension === 'gltf' || fileExtension === 'glb') && (
        <GLTFModel modelUrl={modelUrl} />
      )}
      {!['obj', 'gltf', 'glb'].includes(fileExtension) && <PlaceholderModel />}
    </Suspense>
  )
}

export default Model
