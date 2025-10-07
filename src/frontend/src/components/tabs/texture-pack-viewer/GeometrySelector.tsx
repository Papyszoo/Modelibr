import { Button } from 'primereact/button'
import './GeometrySelector.css'

export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'torus'

interface GeometrySelectorProps {
  onGeometrySelect: (geometry: GeometryType) => void
}

const geometries: { type: GeometryType; icon: string; label: string }[] = [
  { type: 'box', icon: 'pi pi-stop', label: 'Cube' },
  { type: 'sphere', icon: 'pi pi-circle', label: 'Sphere' },
  { type: 'cylinder', icon: 'pi pi-tablet', label: 'Cylinder' },
  { type: 'torus', icon: 'pi pi-circle-off', label: 'Torus' },
]

function GeometrySelector({ onGeometrySelect }: GeometrySelectorProps) {
  return (
    <div className="geometry-selector">
      <h3 className="geometry-selector-title">
        <i className="pi pi-eye"></i>
        Preview with Geometry
      </h3>
      <div className="geometry-buttons">
        {geometries.map(({ type, icon, label }) => (
          <Button
            key={type}
            icon={icon}
            label={label}
            className="p-button-outlined geometry-btn"
            onClick={() => onGeometrySelect(type)}
            tooltip={`Preview on ${label}`}
            tooltipOptions={{ position: 'top' }}
          />
        ))}
      </div>
    </div>
  )
}

export default GeometrySelector
