import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, useLoader } from '@react-three/fiber'
import { useQueries } from '@tanstack/react-query'
import { type JSX, Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { getFileUrl } from '@/features/models/api/modelApi'
import { getSceneResourceQueryOptions } from '@/features/scenes/api/resourceQueries'
import { SceneNodeObject } from '@/features/scenes/components/SceneNodeObject'
import type { SceneAssetSource } from '@/features/scenes/hooks/useSceneAssetSources'
import type { SceneNode } from '@/features/scenes/types'
import { getFileExtension } from '@/utils/fileUtils'

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

/**
 * The live preview: a three.js viewport drawing the effect at `time`.
 *
 * Mesh sources are resolved here, outside the Canvas, because the R3F
 * reconciler cannot see the app's QueryClient - the same split the scene
 * editor uses.
 */
export function VfxPreview({
  definition,
  time,
  selectedId,
  spriteFiles,
}: VfxPreviewProps): JSX.Element {
  const meshComponents = definition.components.filter(
    c => c.type === 'mesh' && c.mesh && c.mesh.modelId > 0
  )
  const resourceQueries = useQueries({
    queries: meshComponents.map(c =>
      getSceneResourceQueryOptions({
        assetType: 'Model',
        assetId: c.mesh!.modelId,
        versionId: c.mesh!.versionId ?? null,
      })
    ),
  })

  const sources = new Map<string, SceneAssetSource>()
  meshComponents.forEach((component, index) => {
    const resource = resourceQueries[index]?.data
    if (!resource?.resolved || !resource.original) return
    const resources: Record<string, string> = {}
    for (const auxiliary of resource.auxiliaries) {
      resources[auxiliary.relativePath] = getFileUrl(String(auxiliary.fileId))
    }
    sources.set(component.id, {
      kind: 'mesh',
      url: getFileUrl(String(resource.original.fileId)),
      extension: getFileExtension(resource.original.originalFileName),
      resources,
      isLoading: false,
      totalSizeBytes: resource.totalSizeBytes,
      triangleCount: resource.triangleCount,
      materialCount: resource.materialCount,
      hasPreview: resource.previews.length > 0,
    })
  })

  return (
    <div className="vfx-preview" data-testid="vfx-preview">
      <Canvas
        camera={{ position: [2.6, 1.9, 3.4], fov: 45 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#14161b']} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 3]} intensity={0.8} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial
            color="#1b1e25"
            roughness={0.95}
            metalness={0}
          />
        </mesh>
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

        {definition.components.map(component => {
          switch (component.type) {
            case 'particles':
              return (
                <Suspense key={component.id} fallback={null}>
                  <ParticlesLayer
                    component={component}
                    time={time}
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
}: {
  component: VfxComponent
  time: number
  spriteFileId?: number
}): JSX.Element | null {
  if (!component.particles) return null
  return spriteFileId ? (
    <TexturedParticles
      component={component}
      time={time}
      url={getFileUrl(String(spriteFileId))}
    />
  ) : (
    <ParticlePoints component={component} time={time} texture={null} />
  )
}

/** Loads the sprite (suspending until it arrives) before drawing the points. */
function TexturedParticles({
  component,
  time,
  url,
}: {
  component: VfxComponent
  time: number
  url: string
}): JSX.Element {
  const texture = useLoader(THREE.TextureLoader, url)
  return <ParticlePoints component={component} time={time} texture={texture} />
}

function ParticlePoints({
  component,
  time,
  texture,
}: {
  component: VfxComponent
  time: number
  texture: THREE.Texture | null
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
          uScale: { value: 600 },
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
