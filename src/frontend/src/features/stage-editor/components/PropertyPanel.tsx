import { InputText } from 'primereact/inputtext'
import { InputNumber } from 'primereact/inputnumber'
import { ColorPicker } from 'primereact/colorpicker'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import {
  StageObject,
  StageLight,
  StageMesh,
  StageGroup,
  StageHelper,
} from './SceneEditor'
import './PropertyPanel.css'

interface PropertyPanelProps {
  selectedObject: StageObject | null
  onUpdateObject: (id: string, updates: Partial<StageObject>) => void
  onDeleteObject: (id: string) => void
}

function PropertyPanel({
  selectedObject,
  onUpdateObject,
  onDeleteObject,
}: PropertyPanelProps): JSX.Element {
  if (!selectedObject) {
    return (
      <div className="property-panel">
        <div className="property-panel-empty">
          <p>Select an object to edit its properties</p>
        </div>
      </div>
    )
  }

  const isLight = (obj: StageObject): obj is StageLight =>
    obj.id.startsWith('light-')
  const isMesh = (obj: StageObject): obj is StageMesh =>
    obj.id.startsWith('mesh-')
  const isGroup = (obj: StageObject): obj is StageGroup =>
    obj.id.startsWith('group-')
  const isHelper = (obj: StageObject): obj is StageHelper =>
    obj.id.startsWith('helper-')

  const handleColorChange = (value: string) => {
    onUpdateObject(selectedObject.id, { color: `#${value}` })
  }

  const renderVectorInput = (
    label: string,
    value: [number, number, number],
    onChange: (value: [number, number, number]) => void
  ) => (
    <div className="property-group">
      <label>{label}</label>
      <div className="property-vector">
        <div className="property-vector-item">
          <label>X</label>
          <InputNumber
            value={value[0]}
            onValueChange={e => onChange([e.value ?? 0, value[1], value[2]])}
            mode="decimal"
            minFractionDigits={1}
            maxFractionDigits={2}
            step={0.5}
          />
        </div>
        <div className="property-vector-item">
          <label>Y</label>
          <InputNumber
            value={value[1]}
            onValueChange={e => onChange([value[0], e.value ?? 0, value[2]])}
            mode="decimal"
            minFractionDigits={1}
            maxFractionDigits={2}
            step={0.5}
          />
        </div>
        <div className="property-vector-item">
          <label>Z</label>
          <InputNumber
            value={value[2]}
            onValueChange={e => onChange([value[0], value[1], e.value ?? 0])}
            mode="decimal"
            minFractionDigits={1}
            maxFractionDigits={2}
            step={0.5}
          />
        </div>
      </div>
    </div>
  )

  const renderLightProperties = (light: StageLight) => (
    <>
      <div className="property-group">
        <label>Color</label>
        <div className="color-input-group">
          <ColorPicker
            value={light.color.replace('#', '')}
            onChange={e => handleColorChange(e.value as string)}
          />
          <InputText value={light.color} disabled />
        </div>
      </div>

      <div className="property-group">
        <label>Intensity</label>
        <InputNumber
          value={light.intensity}
          onValueChange={e =>
            onUpdateObject(light.id, { intensity: e.value ?? 1 })
          }
          mode="decimal"
          minFractionDigits={1}
          maxFractionDigits={2}
          min={0}
          max={10}
          step={0.1}
        />
      </div>

      {light.type !== 'ambient' &&
        light.type !== 'hemisphere' &&
        light.position &&
        renderVectorInput('Position', light.position, position =>
          onUpdateObject(light.id, { position })
        )}

      {light.type === 'hemisphere' && light.groundColor && (
        <div className="property-group">
          <label>Ground Color</label>
          <div className="color-input-group">
            <ColorPicker
              value={light.groundColor.replace('#', '')}
              onChange={e =>
                onUpdateObject(light.id, { groundColor: `#${e.value}` })
              }
            />
            <InputText value={light.groundColor} disabled />
          </div>
        </div>
      )}

      {light.type === 'spot' && (
        <>
          <div className="property-group">
            <label>Angle</label>
            <InputNumber
              value={light.angle ? (light.angle * 180) / Math.PI : 30}
              onValueChange={e =>
                onUpdateObject(light.id, {
                  angle: ((e.value ?? 30) * Math.PI) / 180,
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
              value={light.penumbra ?? 0.1}
              onValueChange={e =>
                onUpdateObject(light.id, { penumbra: e.value ?? 0.1 })
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
      )}

      {(light.type === 'point' || light.type === 'spot') && (
        <>
          <div className="property-group">
            <label>Distance</label>
            <InputNumber
              value={light.distance ?? 0}
              onValueChange={e =>
                onUpdateObject(light.id, { distance: e.value ?? 0 })
              }
              mode="decimal"
              min={0}
              step={1}
            />
          </div>
          <div className="property-group">
            <label>Decay</label>
            <InputNumber
              value={light.decay ?? 2}
              onValueChange={e =>
                onUpdateObject(light.id, { decay: e.value ?? 2 })
              }
              mode="decimal"
              minFractionDigits={1}
              maxFractionDigits={2}
              min={0}
              step={0.5}
            />
          </div>
        </>
      )}
    </>
  )

  const renderMeshProperties = (mesh: StageMesh) => (
    <>
      <div className="property-group">
        <label>Color</label>
        <div className="color-input-group">
          <ColorPicker
            value={mesh.color.replace('#', '')}
            onChange={e => handleColorChange(e.value as string)}
          />
          <InputText value={mesh.color} disabled />
        </div>
      </div>

      <div className="property-group">
        <label>Wireframe</label>
        <Checkbox
          checked={mesh.wireframe ?? false}
          onChange={e =>
            onUpdateObject(mesh.id, { wireframe: e.checked ?? false })
          }
        />
      </div>

      {renderVectorInput('Position', mesh.position, position =>
        onUpdateObject(mesh.id, { position })
      )}

      {renderVectorInput('Rotation', mesh.rotation, rotation =>
        onUpdateObject(mesh.id, { rotation })
      )}

      {renderVectorInput('Scale', mesh.scale, scale =>
        onUpdateObject(mesh.id, { scale })
      )}
    </>
  )

  const renderGroupProperties = (group: StageGroup) => (
    <>
      <div className="property-group">
        <label>Name</label>
        <InputText
          value={group.name}
          onChange={e => onUpdateObject(group.id, { name: e.target.value })}
        />
      </div>

      {renderVectorInput('Position', group.position, position =>
        onUpdateObject(group.id, { position })
      )}

      {renderVectorInput('Rotation', group.rotation, rotation =>
        onUpdateObject(group.id, { rotation })
      )}

      {renderVectorInput('Scale', group.scale, scale =>
        onUpdateObject(group.id, { scale })
      )}
    </>
  )

  const renderHelperProperties = (helper: StageHelper) => (
    <>
      <div className="property-group">
        <label>Enabled</label>
        <Checkbox
          checked={helper.enabled}
          onChange={e =>
            onUpdateObject(helper.id, { enabled: e.checked ?? true })
          }
        />
      </div>
    </>
  )

  const getObjectTypeName = () => {
    if (isLight(selectedObject)) {
      return (
        selectedObject.type.charAt(0).toUpperCase() +
        selectedObject.type.slice(1) +
        ' Light'
      )
    } else if (isMesh(selectedObject)) {
      return (
        selectedObject.type.charAt(0).toUpperCase() +
        selectedObject.type.slice(1) +
        ' Mesh'
      )
    } else if (isGroup(selectedObject)) {
      return 'Group'
    } else if (isHelper(selectedObject)) {
      return (
        selectedObject.type.charAt(0).toUpperCase() +
        selectedObject.type.slice(1)
      )
    }
    return 'Object'
  }

  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <Button
          icon="pi pi-trash"
          label="Delete"
          className="p-button-danger p-button-sm"
          onClick={() => onDeleteObject(selectedObject.id)}
          tooltip="Delete Object"
          tooltipOptions={{ position: 'bottom' }}
        />
      </div>

      <div className="property-panel-content">
        <div className="property-group">
          <label>Type</label>
          <InputText value={getObjectTypeName()} disabled />
        </div>

        {isLight(selectedObject) && renderLightProperties(selectedObject)}
        {isMesh(selectedObject) && renderMeshProperties(selectedObject)}
        {isGroup(selectedObject) && renderGroupProperties(selectedObject)}
        {isHelper(selectedObject) && renderHelperProperties(selectedObject)}
      </div>
    </div>
  )
}

export default PropertyPanel
