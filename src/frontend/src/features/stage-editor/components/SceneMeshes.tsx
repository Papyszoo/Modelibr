import { StageMesh } from './SceneEditor'

interface SceneMeshesProps {
  meshes: StageMesh[]
  selectedId: string | null
  onSelectMesh: (id: string) => void
}

export function SceneMeshes({
  meshes,
  selectedId,
  onSelectMesh,
}: SceneMeshesProps): JSX.Element {
  const renderGeometry = (mesh: StageMesh) => {
    switch (mesh.type) {
      case 'box':
        return <boxGeometry />
      case 'sphere':
        return <sphereGeometry args={[1, 32, 32]} />
      case 'plane':
        return <planeGeometry args={[2, 2]} />
      case 'cylinder':
        return <cylinderGeometry args={[1, 1, 2, 32]} />
      case 'cone':
        return <coneGeometry args={[1, 2, 32]} />
      case 'torus':
        return <torusGeometry args={[1, 0.4, 16, 100]} />
      case 'torusKnot':
        return <torusKnotGeometry args={[1, 0.4, 100, 16]} />
      case 'dodecahedron':
        return <dodecahedronGeometry />
      case 'icosahedron':
        return <icosahedronGeometry />
      case 'octahedron':
        return <octahedronGeometry />
      case 'tetrahedron':
        return <tetrahedronGeometry />
      default:
        return <boxGeometry />
    }
  }

  return (
    <>
      {meshes.map(mesh => (
        <mesh
          key={mesh.id}
          position={mesh.position}
          rotation={mesh.rotation}
          scale={mesh.scale}
          onClick={e => {
            e.stopPropagation()
            onSelectMesh(mesh.id)
          }}
        >
          {renderGeometry(mesh)}
          <meshStandardMaterial
            color={mesh.color}
            wireframe={mesh.wireframe}
            emissive={selectedId === mesh.id ? '#ffaa00' : '#000000'}
            emissiveIntensity={selectedId === mesh.id ? 0.3 : 0}
          />
        </mesh>
      ))}
    </>
  )
}

