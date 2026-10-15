import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/**
 * Procedural studio IBL (RoomEnvironment -> PMREM), generated in-process so a
 * preview keeps real reflections with zero network dependency. Replaces drei's
 * `<Stage environment="city">`, which fetches an HDR from a CDN - a local-first
 * violation that also breaks on offline / air-gapped installs.
 *
 * Shared by every three.js preview so they all light identically.
 */
export function PreviewEnvironment(): null {
  const gl = useThree(s => s.gl)
  const scene = useThree(s => s.scene)
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
