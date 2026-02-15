import {
  Environment,
  ContactShadows,
  AccumulativeShadows,
  RandomizedLight,
  Sky,
  Stars,
  Backdrop,
  GizmoHelper,
  GizmoViewport,
  Stage as DreiStage,
} from '@react-three/drei'
import { StageHelper } from './SceneEditor'

interface SceneHelpersProps {
  helpers: StageHelper[]
}

export function SceneHelpers({ helpers }: SceneHelpersProps): JSX.Element {
  return (
    <>
      {helpers.map(helper => {
        if (!helper.enabled) return null

        switch (helper.type) {
          case 'stage':
            return (
              <DreiStage
                key={helper.id}
                shadows={{
                  type: 'contact',
                  opacity: 0.4,
                  blur: 1.5,
                }}
                adjustCamera={false}
                intensity={1}
              />
            )

          case 'environment':
            return (
              <Environment key={helper.id} preset="city" background={false} />
            )

          case 'contactShadows':
            return (
              <ContactShadows
                key={helper.id}
                position={[0, -0.5, 0]}
                opacity={0.4}
                scale={10}
                blur={1.5}
                far={10}
              />
            )

          case 'accumulativeShadows':
            return (
              <AccumulativeShadows
                key={helper.id}
                temporal
                frames={100}
                color="#9d4b4b"
                colorBlend={0.5}
                alphaTest={0.9}
                scale={20}
                position={[0, -0.5, 0]}
              >
                <RandomizedLight
                  amount={8}
                  radius={4}
                  ambient={0.5}
                  intensity={1}
                  position={[5, 5, -10]}
                  bias={0.001}
                />
              </AccumulativeShadows>
            )

          case 'sky':
            return (
              <Sky
                key={helper.id}
                distance={450000}
                sunPosition={[0, 1, 0]}
                inclination={0}
                azimuth={0.25}
              />
            )

          case 'stars':
            return (
              <Stars
                key={helper.id}
                radius={100}
                depth={50}
                count={5000}
                factor={4}
                saturation={0}
                fade
                speed={1}
              />
            )

          case 'backdrop':
            return (
              <Backdrop
                key={helper.id}
                floor={1.5}
                segments={20}
                scale={[10, 5, 5]}
                position={[0, -1, -5]}
              >
                <meshStandardMaterial color="#353540" />
              </Backdrop>
            )

          case 'grid':
            // Grid is handled separately in EditorCanvas
            return null

          case 'gizmoHelper':
            return (
              <GizmoHelper
                key={helper.id}
                alignment="bottom-right"
                margin={[80, 80]}
              >
                <GizmoViewport
                  axisColors={['#9d4b4b', '#2f7f4f', '#3b5b9d']}
                  labelColor="white"
                />
              </GizmoHelper>
            )

          default:
            return null
        }
      })}
    </>
  )
}

