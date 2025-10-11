import { InputText } from 'primereact/inputtext'
import { InputNumber } from 'primereact/inputnumber'
import { ColorPicker } from 'primereact/colorpicker'
import { Button } from 'primereact/button'
import { SceneLight } from './SceneEditor'
import './PropertyPanel.css'

interface PropertyPanelProps {
  selectedObject: SceneLight | undefined
  onUpdateObject: (id: string, updates: Partial<SceneLight>) => void
  onDeleteObject: (id: string) => void
}

function PropertyPanel({
  selectedObject,
  onUpdateObject,
  onDeleteObject
}: PropertyPanelProps): JSX.Element {
  if (!selectedObject) {
    return (
      <div className="property-panel">
        <div className="property-panel-header">
          <h3>
            <i className="pi pi-sliders-h" /> Properties
          </h3>
        </div>
        <div className="property-panel-empty">
          <p>Select an object to edit its properties</p>
        </div>
      </div>
    )
  }

  const handleColorChange = (value: string) => {
    onUpdateObject(selectedObject.id, { color: `#${value}` })
  }

  const renderPositionInputs = () => {
    if (selectedObject.type === 'ambient' || !selectedObject.position) {
      return null
    }

    return (
      <div className="property-group">
        <label>Position</label>
        <div className="property-vector">
          <div className="property-vector-item">
            <label>X</label>
            <InputNumber
              value={selectedObject.position[0]}
              onValueChange={e =>
                onUpdateObject(selectedObject.id, {
                  position: [
                    e.value ?? 0,
                    selectedObject.position![1],
                    selectedObject.position![2]
                  ]
                })
              }
              mode="decimal"
              minFractionDigits={1}
              maxFractionDigits={2}
              step={0.5}
            />
          </div>
          <div className="property-vector-item">
            <label>Y</label>
            <InputNumber
              value={selectedObject.position[1]}
              onValueChange={e =>
                onUpdateObject(selectedObject.id, {
                  position: [
                    selectedObject.position![0],
                    e.value ?? 0,
                    selectedObject.position![2]
                  ]
                })
              }
              mode="decimal"
              minFractionDigits={1}
              maxFractionDigits={2}
              step={0.5}
            />
          </div>
          <div className="property-vector-item">
            <label>Z</label>
            <InputNumber
              value={selectedObject.position[2]}
              onValueChange={e =>
                onUpdateObject(selectedObject.id, {
                  position: [
                    selectedObject.position![0],
                    selectedObject.position![1],
                    e.value ?? 0
                  ]
                })
              }
              mode="decimal"
              minFractionDigits={1}
              maxFractionDigits={2}
              step={0.5}
            />
          </div>
        </div>
      </div>
    )
  }

  const renderSpotLightProperties = () => {
    if (selectedObject.type !== 'spot') return null

    return (
      <>
        <div className="property-group">
          <label>Angle</label>
          <InputNumber
            value={selectedObject.angle ? (selectedObject.angle * 180) / Math.PI : 30}
            onValueChange={e =>
              onUpdateObject(selectedObject.id, {
                angle: ((e.value ?? 30) * Math.PI) / 180
              })
            }
            suffix="°"
            min={0}
            max={90}
            step={1}
          />
        </div>
        <div className="property-group">
          <label>Penumbra</label>
          <InputNumber
            value={selectedObject.penumbra ?? 0.1}
            onValueChange={e =>
              onUpdateObject(selectedObject.id, { penumbra: e.value ?? 0.1 })
            }
            mode="decimal"
            minFractionDigits={1}
            maxFractionDigits={2}
            min={0}
            max={1}
            step={0.1}
          />
        </div>
      </>
    )
  }

  const renderPointLightProperties = () => {
    if (selectedObject.type !== 'point' && selectedObject.type !== 'spot')
      return null

    return (
      <>
        <div className="property-group">
          <label>Distance</label>
          <InputNumber
            value={selectedObject.distance ?? 0}
            onValueChange={e =>
              onUpdateObject(selectedObject.id, { distance: e.value ?? 0 })
            }
            mode="decimal"
            min={0}
            step={1}
          />
        </div>
        <div className="property-group">
          <label>Decay</label>
          <InputNumber
            value={selectedObject.decay ?? 2}
            onValueChange={e =>
              onUpdateObject(selectedObject.id, { decay: e.value ?? 2 })
            }
            mode="decimal"
            minFractionDigits={1}
            maxFractionDigits={2}
            min={0}
            step={0.5}
          />
        </div>
      </>
    )
  }

  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <h3>
          <i className="pi pi-sliders-h" /> Properties
        </h3>
        <Button
          icon="pi pi-trash"
          className="p-button-rounded p-button-text p-button-danger"
          onClick={() => onDeleteObject(selectedObject.id)}
          tooltip="Delete"
          tooltipOptions={{ position: 'left' }}
        />
      </div>

      <div className="property-panel-content">
        <div className="property-group">
          <label>Type</label>
          <InputText
            value={
              selectedObject.type.charAt(0).toUpperCase() +
              selectedObject.type.slice(1) +
              ' Light'
            }
            disabled
          />
        </div>

        <div className="property-group">
          <label>Color</label>
          <div className="color-input-group">
            <ColorPicker
              value={selectedObject.color.replace('#', '')}
              onChange={e => handleColorChange(e.value as string)}
            />
            <InputText value={selectedObject.color} disabled />
          </div>
        </div>

        <div className="property-group">
          <label>Intensity</label>
          <InputNumber
            value={selectedObject.intensity}
            onValueChange={e =>
              onUpdateObject(selectedObject.id, { intensity: e.value ?? 1 })
            }
            mode="decimal"
            minFractionDigits={1}
            maxFractionDigits={2}
            min={0}
            max={10}
            step={0.1}
          />
        </div>

        {renderPositionInputs()}
        {renderSpotLightProperties()}
        {renderPointLightProperties()}
      </div>
    </div>
  )
}

export default PropertyPanel
