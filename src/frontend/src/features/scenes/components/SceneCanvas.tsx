import './SceneCanvas.css'

import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type JSX } from 'react'

import type { SceneDocument, SceneLight, SceneNodeView } from '../types'
import { SceneNodeObject } from './SceneNodeObject'

interface SceneCanvasProps {
  /** The draft being edited - the source of truth for what is drawn. */
  document: SceneDocument
  /**
   * The server's derived facts for each node, from the last read. Kept separate
   * from the draft because moving a node does not change how big its asset is,
   * so the editor should not have to wait for a round trip to keep drawing it
   * correctly.
   */
  nodeFacts: Map<string, SceneNodeView>
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
}

export function SceneCanvas({
  document,
  nodeFacts,
  selectedNodeId,
  onSelectNode,
}: SceneCanvasProps): JSX.Element {
  return (
    <div className="scene-canvas" data-testid="scene-canvas">
      <Canvas
        shadows
        camera={{ position: [12, 9, 12], fov: 50 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        onPointerMissed={() => onSelectNode(null)}
      >
        <Grid
          args={[40, 40]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#4b5563"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#6b7280"
          fadeDistance={80}
          followCamera={false}
          infiniteGrid
        />

        <SceneDocumentLights lights={document.lights} />

        {document.nodes.map(node => {
          const facts = nodeFacts.get(node.id)
          return (
            <SceneNodeObject
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              onSelect={onSelectNode}
              sourceDimensions={facts?.sourceDimensions ?? null}
              originConvention={facts?.originConvention ?? null}
            />
          )
        })}

        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
    </div>
  )
}

/**
 * The document's lights, plus a minimal fill when it has none.
 *
 * The fill is not written into the document: an unlit scene should look unlit
 * once the user adds their first light, and silently seeding lights would make
 * "why is my scene brighter than my lighting says" the first question asked.
 */
function SceneDocumentLights({
  lights,
}: {
  lights: SceneLight[]
}): JSX.Element {
  if (lights.length === 0) {
    return (
      <>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 12, 6]} intensity={1.1} castShadow />
      </>
    )
  }

  return (
    <>
      {lights.map(light => {
        const position: [number, number, number] = [
          light.position.x,
          light.position.y,
          light.position.z,
        ]

        switch (light.type) {
          case 'ambient':
            return (
              <ambientLight
                key={light.id}
                intensity={light.intensity}
                color={light.color}
              />
            )
          case 'hemisphere':
            return (
              <hemisphereLight
                key={light.id}
                intensity={light.intensity}
                color={light.color}
              />
            )
          case 'directional':
            return (
              <directionalLight
                key={light.id}
                position={position}
                intensity={light.intensity}
                color={light.color}
                castShadow
              />
            )
          case 'spot':
            return (
              <spotLight
                key={light.id}
                position={position}
                intensity={light.intensity}
                color={light.color}
                angle={0.5}
                penumbra={0.4}
                castShadow
              />
            )
          default:
            return (
              <pointLight
                key={light.id}
                position={position}
                intensity={light.intensity}
                color={light.color}
                castShadow
              />
            )
        }
      })}
    </>
  )
}
