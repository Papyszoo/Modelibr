import { useState } from 'react'
import { Button } from 'primereact/button'
import { Accordion, AccordionTab } from 'primereact/accordion'
import { StageConfig } from './SceneEditor'
import './CodePanel.css'

interface CodePanelProps {
  stageConfig: StageConfig
}

function CodePanel({ stageConfig }: CodePanelProps): JSX.Element {
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

    const footer = `
    </group>
  )
}

export default Scene`

    return `${header}
${lights}${footer}`
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
      <Accordion>
        <AccordionTab
          header={
            <div className="code-panel-header">
              <span>
                <i className="pi pi-code" /> Generated Code
              </span>
              <Button
                icon={copied ? 'pi pi-check' : 'pi pi-copy'}
                label={copied ? 'Copied!' : 'Copy'}
                className="p-button-sm p-button-text"
                onClick={e => {
                  e.stopPropagation()
                  handleCopyCode()
                }}
                severity={copied ? 'success' : undefined}
              />
            </div>
          }
        >
          <pre className="code-content">
            <code>{code}</code>
          </pre>
        </AccordionTab>
      </Accordion>
    </div>
  )
}

export default CodePanel
