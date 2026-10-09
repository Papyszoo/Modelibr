import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, useLoader } from '@react-three/fiber'
import { type JSX, Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { getFileUrl } from '@/features/models/api/modelApi'
import { SceneNodeErrorBoundary } from '@/features/scenes/components/SceneNodeErrorBoundary'
import { SceneNodeObject } from '@/features/scenes/components/SceneNodeObject'
import type { SceneAssetSource } from '@/features/scenes/hooks/useSceneAssetSources'
import type { SceneNode } from '@/features/scenes/types'

import { useVfxMeshSources } from '../hooks/useVfxMeshSources'
import {
  createParticleBuffers,
  isComponentActive,
  MAX_PARTICLES,
  sampleParticles,
  sampleTrack,
} from '../lib/vfxRuntime'
import type { VfxComponent, VfxDefinition } from '../types'

interface VfxPreviewProps {
  definition: VfxDefinition
  /** Effect time in seconds; every frame is computed from it alone. */
  time: number
  selectedId: string | null
  /** Sprite id -> file id, for particle textures. */
  spriteFiles: Map<number, number>
}

/** The dark backdrop colour, shared by the editor and the thumbnail render. */
const VFX_BACKGROUND = '#14161b'

/**
 * Background and lights the effect is drawn under, with a dark floor unless
 * `floor` is off (the thumbnail has no horizon to show, only the effect).
 */
export function VfxStage({ floor = true }: { floor?: boolean }): JSX.Element {
  return (
    <>
      <color attach="background" args={[VFX_BACKGROUND]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={0.8} />
      {floor ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial
            color="#1b1e25"
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      ) : null}
    </>
  )
}

interface VfxLayersProps {
  definition: VfxDefinition
  /** Effect time in seconds; every frame is computed from it alone. */
  time: number
  selectedId: string | null
  /** Sprite id -> file id, for particle textures. */
  spriteFiles: Map<number, number>
  sources: Map<string, SceneAssetSource>
  /** Pixels per world unit at distance 1, for particle sizes. */
  pointScale?: number
}

/**
 * Every component of the effect drawn at `time`. This is the one place the
 * effect is turned into pixels: the editor preview and the worker's thumbnail
 * render both mount it, so they cannot disagree about what an effect looks like.
 */
export function VfxLayers({
  definition,
  time,
  selectedId,
  spriteFiles,
  sources,
  pointScale = DEFAULT_POINT_SCALE,
}: VfxLayersProps): JSX.Element {
  return (
    <>
      {definition.components.map(component => {
        switch (component.type) {
          case 'particles':
            return (
              <Suspense key={component.id} fallback={null}>
                <ParticlesLayer
                  component={component}
                  time={time}
                  pointScale={pointScale}
                  spriteFileId={
                    component.particles?.spriteId
                      ? spriteFiles.get(component.particles.spriteId)
                      : undefined
                  }
                />
              </Suspense>
            )
          case 'mesh':
            return (
              <MeshLayer
                key={component.id}
                component={component}
                time={time}
                source={sources.get(component.id)}
                selected={component.id === selectedId}
              />
            )
          case 'light':
            return (
              <LightLayer
                key={component.id}
                component={component}
                time={time}
                selected={component.id === selectedId}
              />
            )
          default:
            return null
        }
      })}
    </>
  )
}

/**
 * The live preview: a three.js viewport drawing the effect at `time`.
 */
export function VfxPreview({
  definition,
  time,
  selectedId,
  spriteFiles,
}: VfxPreviewProps): JSX.Element {
  const { sources } = useVfxMeshSources(definition)

  return (
    <div className="vfx-preview" data-testid="vfx-preview">
      <Canvas
        camera={{ position: [2.6, 1.9, 3.4], fov: 45 }}
        gl={{ antialias: true }}
      >
        <VfxStage />
        <Grid
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#2f3542"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#3d4556"
          fadeDistance={30}
          infiniteGrid
        />

        <VfxLayers
          definition={definition}
          time={time}
          selectedId={selectedId}
          spriteFiles={spriteFiles}
          sources={sources}
        />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={[0, 0.8, 0]}
        />
      </Canvas>
    </div>
  )
}

/** Particle sizes in pixels at distance 1; sized for the editor's viewport. */
const DEFAULT_POINT_SCALE = 600

const particleVertexShader = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const particleFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform bool uHasMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 texel = uHasMap
      ? texture2D(uMap, gl_PointCoord)
      : vec4(1.0, 1.0, 1.0, 1.0 - smoothstep(0.35, 0.5, length(gl_PointCoord - 0.5)));
    float a = texel.a * vAlpha;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vColor * texel.rgb, a);
  }
`

function ParticlesLayer({
  component,
  time,
  spriteFileId,
  pointScale,
}: {
  component: VfxComponent
  time: number
  spriteFileId?: number
  pointScale: number
}): JSX.Element | null {
  if (!component.particles) return null
  const untextured = (
    <ParticlePoints
      component={component}
      time={time}
      texture={null}
      pointScale={pointScale}
    />
  )
  if (!spriteFileId) return untextured

  const url = getFileUrl(String(spriteFileId))
  // A sprite that cannot be loaded (deleted since the effect was saved) must
  // not take the whole canvas down; the particles fall back to plain points.
  return (
    <SceneNodeErrorBoundary
      nodeId={component.id}
      resetKey={url}
      onError={noop}
      fallback={untextured}
    >
      <TexturedParticles
        component={component}
        time={time}
        url={url}
        pointScale={pointScale}
      />
    </SceneNodeErrorBoundary>
  )
}

function noop(): void {}

/** Loads the sprite (suspending until it arrives) before drawing the points. */
function TexturedParticles({
  component,
  time,
  url,
  pointScale,
}: {
  component: VfxComponent
  time: number
  url: string
  pointScale: number
}): JSX.Element {
  const texture = useLoader(THREE.TextureLoader, url)
  return (
    <ParticlePoints
      component={component}
      time={time}
      texture={texture}
      pointScale={pointScale}
    />
  )
}

function ParticlePoints({
  component,
  time,
  texture,
  pointScale,
}: {
  component: VfxComponent
  time: number
  texture: THREE.Texture | null
  pointScale: number
}): JSX.Element {
  const particles = component.particles!
  const buffers = useMemo(() => createParticleBuffers(MAX_PARTICLES), [])
  const geometryRef = useRef<THREE.BufferGeometry>(null)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVertexShader,
        fragmentShader: particleFragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uScale: { value: DEFAULT_POINT_SCALE },
          uMap: { value: null },
          uHasMap: { value: false },
        },
      }),
    []
  )

  useEffect(() => {
    material.blending =
      particles.blending === 'normal'
        ? THREE.NormalBlending
        : THREE.AdditiveBlending
    material.uniforms.uMap.value = texture
    material.uniforms.uHasMap.value = texture !== null
    material.needsUpdate = true
  }, [material, particles.blending, texture])

  useEffect(() => {
    material.uniforms.uScale.value = pointScale
  }, [material, pointScale])

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const geometry = geometryRef.current
    if (!geometry) return
    const count = sampleParticles(component, particles, time, buffers)
    for (const name of ['position', 'color', 'size', 'alpha']) {
      geometry.getAttribute(name).needsUpdate = true
    }
    geometry.setDrawRange(0, count)
  }, [buffers, component, particles, time])

  return (
    <points material={material} frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[buffers.positions, 3]}
        />
        <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[buffers.sizes, 1]} />
        <bufferAttribute attach="attributes-alpha" args={[buffers.alphas, 1]} />
      </bufferGeometry>
    </points>
  )
}

function MeshLayer({
  component,
  time,
  source,
  selected,
}: {
  component: VfxComponent
  time: number
  source?: SceneAssetSource
  selected: boolean
}): JSX.Element | null {
  const groupRef = useRef<THREE.Group>(null)
  const local = time - component.start
  const active = isComponentActive(component, time)
  const scale = sampleTrack(component.tracks?.scale, local, 1)
  const rotationY = sampleTrack(component.tracks?.rotationY, local, 0)
  const opacity = sampleTrack(component.tracks?.opacity, local, 1)

  useEffect(() => {
    groupRef.current?.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]
      for (const material of materials) {
        material.transparent = opacity < 1
        material.opacity = opacity
      }
    })
  })

  const node = useMemo<SceneNode>(
    () => ({
      id: component.id,
      visible: true,
      asset: {
        assetType: 'Model',
        assetId: component.mesh?.modelId ?? 0,
        versionId: component.mesh?.versionId ?? null,
      },
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationEuler: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    }),
    [component.id, component.mesh?.modelId, component.mesh?.versionId]
  )

  if (!active && !selected) return null
  const [x, y, z] = component.position ?? [0, 0, 0]

  return (
    <group
      ref={groupRef}
      position={[x, y, z]}
      rotation={[0, THREE.MathUtils.degToRad(rotationY), 0]}
      scale={[scale, scale, scale]}
      visible={active}
    >
      <Suspense fallback={null}>
        <SceneNodeObject
          node={node}
          selected={false}
          onSelect={() => undefined}
          source={source}
        />
      </Suspense>
    </group>
  )
}

function LightLayer({
  component,
  time,
  selected,
}: {
  component: VfxComponent
  time: number
  selected: boolean
}): JSX.Element | null {
  if (!component.light) return null
  const active = isComponentActive(component, time)
  const intensity = active
    ? sampleTrack(component.tracks?.intensity, time - component.start, 1)
    : 0
  const [x, y, z] = component.position ?? [0, 0, 0]

  return (
    <group position={[x, y, z]}>
      <pointLight
        color={component.light.color}
        intensity={intensity}
        distance={component.light.range}
        decay={1}
      />
      {selected ? (
        <mesh>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={component.light.color} wireframe />
        </mesh>
      ) : null}
    </group>
  )
}
