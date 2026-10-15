import './MaterialEffectPreview.css'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type JSX, useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'

import {
  advanceMaterialEffects,
  inputsFromDocument,
  type MaterialEffectInputs,
  type MaterialEffectsDocument,
  updateMaterialEffects,
} from '@/shared/three/materialEffects'
import {
  buildParameterMaterial,
  type ParameterMaterialSource,
} from '@/shared/three/parameterMaterial'
import { PreviewEnvironment } from '@/shared/three/PreviewEnvironment'

import { PREVIEW_FOV, previewFitDistance } from '../lib/materialEffectAuthoring'

interface MaterialEffectPreviewProps {
  material: ParameterMaterialSource
  /** The validated document; the preview only mounts when it has effects. */
  effects: MaterialEffectsDocument
  /** Tiles show one still frame; the editor advances effect time every frame. */
  animated: boolean
}

/**
 * Keeps the preview camera framed as the fitted distance changes. R3F applies
 * the `<Canvas camera>` prop once at mount, so without this an amplitude or
 * driver edit would leave the sphere at the old zoom.
 */
function PreviewCamera({ distance }: { distance: number }): null {
  const camera = useThree(state => state.camera)
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    camera.position.set(0, 0, distance)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, distance, invalidate])
  return null
}

interface EffectSphereProps extends MaterialEffectPreviewProps {
  inputs: MaterialEffectInputs
}

function EffectSphere({
  material,
  effects,
  inputs,
  animated,
}: EffectSphereProps): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const timeRef = useRef(0)
  const { name, parameters } = material

  // Read only when the material is (re)built below - never a dependency, so an
  // effect edit does not recreate the three.js material.
  const effectsRef = useRef(effects)
  effectsRef.current = effects

  // One material per parameter set and effect structure. Param values, preview
  // inputs and time live in uniforms: the update effect pushes them in, so a
  // slider tick never rebuilds the material. Adding or removing an effect type
  // (or rebinding a driver) still recompiles the shader inside
  // updateMaterialEffects, which is the one change that must.
  const built = useMemo(
    () =>
      buildParameterMaterial({
        name,
        parameters,
        effects: effectsRef.current,
      }),
    [name, parameters]
  )
  useEffect(() => () => built.dispose(), [built])

  useEffect(() => {
    updateMaterialEffects(built, effects, inputs, timeRef.current)
  }, [built, effects, inputs])

  // Effect time is explicit and only moves here: the canvas is demand-driven,
  // so an animated preview asks for its next frame; a still tile asks for
  // nothing and stays a single render at time 0 with the document's inputs.
  useFrame(state => {
    timeRef.current = state.clock.elapsedTime
    if (!animated || !meshRef.current) return
    advanceMaterialEffects(meshRef.current, timeRef.current)
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
  const inputs = useMemo(() => inputsFromDocument(effects), [effects])

  // Fit the wobble: a jelly effect pushes the sphere out by at most its
  // effective amplitude, so back the camera off by that much. The camera
  // component below re-applies it whenever it changes.
  const distance = previewFitDistance(effects.effects, inputs)

  return (
    <div
      className="material-effect-preview"
      data-testid="material-effect-preview"
    >
      <Canvas
        camera={{ position: [0, 0, distance], fov: PREVIEW_FOV }}
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
        <PreviewCamera distance={distance} />
        <PreviewEnvironment />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <EffectSphere
          material={material}
          effects={effects}
          inputs={inputs}
          animated={animated}
        />
      </Canvas>
    </div>
  )
}
