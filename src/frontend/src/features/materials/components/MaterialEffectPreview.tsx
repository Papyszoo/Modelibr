import './MaterialEffectPreview.css'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type JSX, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import {
  advanceMaterialEffects,
  type MaterialEffectsDocument,
} from '@/shared/three/materialEffects'
import {
  buildParameterMaterial,
  type ParameterMaterialSource,
} from '@/shared/three/parameterMaterial'

interface MaterialEffectPreviewProps {
  material: ParameterMaterialSource
  /** The validated document; the preview only mounts when it has effects. */
  effects: MaterialEffectsDocument
  /** Tiles show one still frame; the editor advances effect time every frame. */
  animated: boolean
}

/**
 * Procedural studio IBL (RoomEnvironment -> PMREM), generated in-process so the
 * sphere keeps real reflections without a CDN fetch - the same local-first rule
 * the texture-set preview follows.
 */
function PreviewEnvironment(): null {
  const gl = useThree(state => state.gl)
  const scene = useThree(state => state.scene)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const envMap = pmrem.fromScene(room).texture
    const previous = scene.environment
    scene.environment = envMap
    room.dispose()
    pmrem.dispose()
    return () => {
      scene.environment = previous
      envMap.dispose()
    }
  }, [gl, scene])
  return null
}

function EffectSphere({
  material,
  effects,
  animated,
}: MaterialEffectPreviewProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const { name, parameters } = material

  // One material per parameter/effect set. buildParameterMaterial installs the
  // effects on the same MeshPhysicalMaterial the viewer and scenes render, so
  // the preview cannot disagree with the placed material. Memoised on the
  // primitive inputs so the editor's unrelated re-renders do not rebuild it.
  const built = useMemo(
    () => buildParameterMaterial({ name, parameters, effects }),
    [name, parameters, effects]
  )
  useEffect(() => () => built.dispose(), [built])

  // Effect time is explicit and only moves here: the canvas is demand-driven,
  // so an animated preview asks for its next frame; a still tile asks for
  // nothing and stays a single render at time 0 with the document's inputs.
  useFrame(state => {
    if (!animated || !meshRef.current) return
    advanceMaterialEffects(meshRef.current, state.clock.elapsedTime)
    state.invalidate()
  })

  return (
    <mesh ref={meshRef} material={built}>
      <sphereGeometry args={[1, 64, 64]} />
    </mesh>
  )
}

/**
 * A real three.js preview of a parameter material that carries runtime effects.
 *
 * The CSS swatch can approximate a colour and a roughness but not a shader
 * effect, so materials with a rim, an emission pulse or a jelly wobble render
 * their actual three.js material here instead.
 */
export function MaterialEffectPreview({
  material,
  effects,
  animated,
}: MaterialEffectPreviewProps): JSX.Element {
  return (
    <div
      className="material-effect-preview"
      data-testid="material-effect-preview"
    >
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 35 }}
        // Render on demand: the initial still frame draws once, and the effects
        // hook asks for the next frame only while the material carries effects
        // and the preview is animated.
        frameloop="demand"
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        dpr={Math.min(window.devicePixelRatio || 1, 2)}
      >
        <PreviewEnvironment />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <EffectSphere
          material={material}
          effects={effects}
          animated={animated}
        />
      </Canvas>
    </div>
  )
}
