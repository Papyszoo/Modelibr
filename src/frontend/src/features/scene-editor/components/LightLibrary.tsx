import { Button } from 'primereact/button'
import { SceneLight } from './SceneEditor'
import './LightLibrary.css'

interface LightLibraryProps {
  onAddLight: (type: SceneLight['type']) => void
}

function LightLibrary({ onAddLight }: LightLibraryProps): JSX.Element {
  const lightTypes: Array<{
    type: SceneLight['type']
    label: string
    icon: string
    description: string
  }> = [
    {
      type: 'ambient',
      label: 'Ambient Light',
      icon: 'pi pi-sun',
      description: 'Globally illuminates all objects'
    },
    {
      type: 'directional',
      label: 'Directional Light',
      icon: 'pi pi-arrow-down',
      description: 'Light from a distance (like sun)'
    },
    {
      type: 'point',
      label: 'Point Light',
      icon: 'pi pi-circle',
      description: 'Light emanating from a point'
    },
    {
      type: 'spot',
      label: 'Spot Light',
      icon: 'pi pi-angle-down',
      description: 'Cone-shaped light beam'
    }
  ]

  return (
    <div className="light-library">
      <div className="light-library-header">
        <h3>
          <i className="pi pi-th-large" /> Components
        </h3>
      </div>
      <div className="light-library-content">
        <div className="light-library-section">
          <h4>Lights</h4>
          <div className="light-types">
            {lightTypes.map(({ type, label, icon, description }) => (
              <div key={type} className="light-type-item">
                <Button
                  label={label}
                  icon={icon}
                  onClick={() => onAddLight(type)}
                  className="p-button-outlined w-full"
                  tooltip={description}
                  tooltipOptions={{ position: 'right' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LightLibrary
