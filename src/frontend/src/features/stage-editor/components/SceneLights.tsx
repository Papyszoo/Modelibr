import { StageLight } from './SceneEditor'

interface SceneLightsProps {
  lights: StageLight[]
  selectedId: string | null
  onSelectLight: (id: string) => void
}

function SceneLights({
  lights,
  selectedId,
  onSelectLight,
}: SceneLightsProps): JSX.Element {
  return (
    <>
      {lights.map(light => {
        const isSelected = light.id === selectedId

        switch (light.type) {
          case 'ambient':
            return (
              <ambientLight
                key={light.id}
                color={light.color}
                intensity={light.intensity}
              />
            )

          case 'directional':
            return (
              <group key={light.id}>
                <directionalLight
                  color={light.color}
                  intensity={light.intensity}
                  position={light.position || [5, 5, 5]}
                  target-position={light.target || [0, 0, 0]}
                  castShadow
                />
                {/* Visual helper */}
                {light.position && (
                  <mesh
                    position={light.position}
                    onClick={e => {
                      e.stopPropagation()
                      onSelectLight(light.id)
                    }}
                  >
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshBasicMaterial
                      color={isSelected ? '#ff6b35' : light.color}
                    />
                  </mesh>
                )}
              </group>
            )

          case 'point':
            return (
              <group key={light.id}>
                <pointLight
                  color={light.color}
                  intensity={light.intensity}
                  position={light.position || [5, 5, 5]}
                  distance={light.distance || 0}
                  decay={light.decay || 2}
                  castShadow
                />
                {/* Visual helper */}
                {light.position && (
                  <mesh
                    position={light.position}
                    onClick={e => {
                      e.stopPropagation()
                      onSelectLight(light.id)
                    }}
                  >
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshBasicMaterial
                      color={isSelected ? '#ff6b35' : light.color}
                    />
                  </mesh>
                )}
              </group>
            )

          case 'spot':
            return (
              <group key={light.id}>
                <spotLight
                  color={light.color}
                  intensity={light.intensity}
                  position={light.position || [5, 5, 5]}
                  angle={light.angle || Math.PI / 6}
                  penumbra={light.penumbra || 0.1}
                  distance={light.distance || 0}
                  decay={light.decay || 2}
                  castShadow
                />
                {/* Visual helper */}
                {light.position && (
                  <mesh
                    position={light.position}
                    onClick={e => {
                      e.stopPropagation()
                      onSelectLight(light.id)
                    }}
                  >
                    <coneGeometry args={[0.3, 0.6, 16]} />
                    <meshBasicMaterial
                      color={isSelected ? '#ff6b35' : light.color}
                    />
                  </mesh>
                )}
              </group>
            )

          case 'hemisphere':
            return (
              <hemisphereLight
                key={light.id}
                color={light.color}
                groundColor={light.groundColor || '#080820'}
                intensity={light.intensity}
              />
            )

          default:
            return null
        }
      })}
    </>
  )
}

export default SceneLights
