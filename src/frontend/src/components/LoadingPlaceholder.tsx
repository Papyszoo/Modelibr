import { Text } from '@react-three/drei'

function LoadingPlaceholder(): JSX.Element {
  return (
    <Text
      position={[0, 0, 0]}
      fontSize={0.5}
      color="#666"
      anchorX="center"
      anchorY="middle"
    >
      Loading 3D Model...
    </Text>
  )
}

export default LoadingPlaceholder