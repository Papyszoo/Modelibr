import { useState } from 'react'
import { Button } from 'primereact/button'
import { StageConfig } from './SceneEditor'
import './CodePanel.css'

interface CodePanelProps {
  stageConfig: StageConfig
}

export function CodePanel({ stageConfig }: CodePanelProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  const generateCode = (): string => {
    const header = `function Scene() {
  return (
    <group>`

    const lights = stageConfig.lights
      .map(light => {
        switch (light.type) {
          case 'ambient':
            return `      <ambientLight color="${light.color}" intensity={${light.intensity}} />`

          case 'directional':
            return `      <directionalLight
        color="${light.color}"
        intensity={${light.intensity}}
        position={[${light.position?.join(', ')}]}
        castShadow
      />`

          case 'point':
            return `      <pointLight
        color="${light.color}"
        intensity={${light.intensity}}
        position={[${light.position?.join(', ')}]}
        distance={${light.distance}}
        decay={${light.decay}}
        castShadow
      />`

          case 'spot':
            return `      <spotLight
        color="${light.color}"
        intensity={${light.intensity}}
        position={[${light.position?.join(', ')}]}
        angle={${light.angle}}
        penumbra={${light.penumbra}}
        distance={${light.distance}}
        decay={${light.decay}}
        castShadow
      />`

          case 'hemisphere':
            return `      <hemisphereLight
        color="${light.color}"
        groundColor="${light.groundColor || '#080820'}"
        intensity={${light.intensity}}
      />`

          default:
            return ''
        }
      })
      .join('\n')

    const meshes = stageConfig.meshes
      .map(mesh => {
        const geometryType =
          mesh.type === 'torusKnot'
            ? 'torusKnotGeometry'
            : `${mesh.type}Geometry`
        const wireframeProps = mesh.wireframe ? ' wireframe' : ''

        return `      <mesh
        position={[${mesh.position.join(', ')}]}
        rotation={[${mesh.rotation.join(', ')}]}
        scale={[${mesh.scale.join(', ')}]}
      >
        <${geometryType} />
        <meshStandardMaterial color="${mesh.color}"${wireframeProps} />
      </mesh>`
      })
      .join('\n')

    const groups = stageConfig.groups
      .map(group => {
        return `      <group
        name="${group.name}"
        position={[${group.position.join(', ')}]}
        rotation={[${group.rotation.join(', ')}]}
        scale={[${group.scale.join(', ')}]}
      >
        {/* Add children here */}
      </group>`
      })
      .join('\n')

    const helpers = stageConfig.helpers
      .filter(helper => helper.enabled)
      .map(helper => {
        switch (helper.type) {
          case 'grid':
            return `      <Grid infiniteGrid />`
          case 'stage':
            return `      <Stage shadows="contact" />`
          case 'environment':
            return `      <Environment preset="sunset" />`
          case 'contactShadows':
            return `      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={10} />`
          case 'sky':
            return `      <Sky sunPosition={[0, 1, 0]} />`
          case 'stars':
            return `      <Stars radius={100} depth={50} count={5000} factor={4} />`
          case 'gizmoHelper':
            return `      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>`
          default:
            return ''
        }
      })
      .join('\n')

    const allElements = [lights, meshes, groups, helpers]
      .filter(section => section.length > 0)
      .join('\n')

    const footer = `
    </group>
  )
}

export default Scene`

    return `${header}
${allElements}${footer}`
  }

  const handleCopyCode = async () => {
    const code = generateCode()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const code = generateCode()

  return (
    <div className="code-panel">
      <div className="code-panel-header">
        <Button
          icon={copied ? 'pi pi-check' : 'pi pi-copy'}
          label={copied ? 'Copied!' : 'Copy'}
          className="p-button-sm"
          onClick={handleCopyCode}
          severity={copied ? 'success' : undefined}
        />
      </div>
      <pre className="code-content">
        <code>{code}</code>
      </pre>
    </div>
  )
}

