import { Button } from 'primereact/button'
import './ComponentLibrary.css'

export type ComponentType =
  | 'light'
  | 'mesh'
  | 'group'
  | 'environment'
  | 'helper'

export type LightType =
  | 'ambient'
  | 'directional'
  | 'point'
  | 'spot'
  | 'hemisphere'

export type MeshType =
  | 'box'
  | 'sphere'
  | 'plane'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'torusKnot'
  | 'dodecahedron'
  | 'icosahedron'
  | 'octahedron'
  | 'tetrahedron'

export type HelperType =
  | 'stage'
  | 'environment'
  | 'contactShadows'
  | 'accumulativeShadows'
  | 'sky'
  | 'stars'
  | 'backdrop'
  | 'grid'
  | 'gizmoHelper'

export interface ComponentDefinition {
  type: string
  label: string
  icon: string
  description: string
  category: ComponentType
}

interface ComponentLibraryProps {
  onAddComponent: (category: ComponentType, type: string) => void
}

export function ComponentLibrary({
  onAddComponent,
}: ComponentLibraryProps): JSX.Element {
  const lightTypes: ComponentDefinition[] = [
    {
      type: 'ambient',
      label: 'Ambient Light',
      icon: 'pi pi-sun',
      description: 'Globally illuminates all objects',
      category: 'light',
    },
    {
      type: 'directional',
      label: 'Directional Light',
      icon: 'pi pi-arrow-down',
      description: 'Light from a distance (like sun)',
      category: 'light',
    },
    {
      type: 'point',
      label: 'Point Light',
      icon: 'pi pi-circle',
      description: 'Light emanating from a point',
      category: 'light',
    },
    {
      type: 'spot',
      label: 'Spot Light',
      icon: 'pi pi-angle-down',
      description: 'Cone-shaped light beam',
      category: 'light',
    },
    {
      type: 'hemisphere',
      label: 'Hemisphere Light',
      icon: 'pi pi-circle-off',
      description: 'Sky and ground lighting',
      category: 'light',
    },
  ]

  const meshTypes: ComponentDefinition[] = [
    {
      type: 'box',
      label: 'Box',
      icon: 'pi pi-stop',
      description: 'Cube geometry',
      category: 'mesh',
    },
    {
      type: 'sphere',
      label: 'Sphere',
      icon: 'pi pi-circle',
      description: 'Sphere geometry',
      category: 'mesh',
    },
    {
      type: 'plane',
      label: 'Plane',
      icon: 'pi pi-minus',
      description: 'Flat plane geometry',
      category: 'mesh',
    },
    {
      type: 'cylinder',
      label: 'Cylinder',
      icon: 'pi pi-ellipsis-v',
      description: 'Cylinder geometry',
      category: 'mesh',
    },
    {
      type: 'cone',
      label: 'Cone',
      icon: 'pi pi-sort-up',
      description: 'Cone geometry',
      category: 'mesh',
    },
    {
      type: 'torus',
      label: 'Torus',
      icon: 'pi pi-replay',
      description: 'Donut-shaped geometry',
      category: 'mesh',
    },
    {
      type: 'torusKnot',
      label: 'Torus Knot',
      icon: 'pi pi-spinner',
      description: 'Complex knot geometry',
      category: 'mesh',
    },
    {
      type: 'dodecahedron',
      label: 'Dodecahedron',
      icon: 'pi pi-compass',
      description: '12-sided polyhedron',
      category: 'mesh',
    },
    {
      type: 'icosahedron',
      label: 'Icosahedron',
      icon: 'pi pi-star',
      description: '20-sided polyhedron',
      category: 'mesh',
    },
    {
      type: 'octahedron',
      label: 'Octahedron',
      icon: 'pi pi-diamond',
      description: '8-sided polyhedron',
      category: 'mesh',
    },
    {
      type: 'tetrahedron',
      label: 'Tetrahedron',
      icon: 'pi pi-caret-up',
      description: '4-sided polyhedron',
      category: 'mesh',
    },
  ]

  const helperTypes: ComponentDefinition[] = [
    {
      type: 'stage',
      label: 'Stage',
      icon: 'pi pi-box',
      description: 'Drei Stage component with shadows',
      category: 'helper',
    },
    {
      type: 'environment',
      label: 'Environment',
      icon: 'pi pi-globe',
      description: 'HDR environment map',
      category: 'helper',
    },
    {
      type: 'contactShadows',
      label: 'Contact Shadows',
      icon: 'pi pi-ellipsis-h',
      description: 'Ground contact shadows',
      category: 'helper',
    },
    {
      type: 'accumulativeShadows',
      label: 'Accumulative Shadows',
      icon: 'pi pi-align-center',
      description: 'Soft accumulative shadows',
      category: 'helper',
    },
    {
      type: 'sky',
      label: 'Sky',
      icon: 'pi pi-cloud',
      description: 'Procedural sky',
      category: 'helper',
    },
    {
      type: 'stars',
      label: 'Stars',
      icon: 'pi pi-star',
      description: 'Starfield background',
      category: 'helper',
    },
    {
      type: 'backdrop',
      label: 'Backdrop',
      icon: 'pi pi-window-maximize',
      description: 'Studio backdrop',
      category: 'helper',
    },
    {
      type: 'grid',
      label: 'Grid',
      icon: 'pi pi-th-large',
      description: 'Grid helper',
      category: 'helper',
    },
    {
      type: 'gizmoHelper',
      label: 'Gizmo Helper',
      icon: 'pi pi-directions',
      description: 'Viewport gizmo',
      category: 'helper',
    },
  ]

  const renderSection = (
    title: string,
    components: ComponentDefinition[],
    category: ComponentType
  ) => (
    <div className="component-library-section">
      <h4>{title}</h4>
      <div className="component-types">
        {components.map(({ type, label, icon, description }) => (
          <div key={type} className="component-type-item">
            <Button
              label={label}
              icon={icon}
              onClick={() => onAddComponent(category, type)}
              className="p-button-outlined w-full"
              tooltip={description}
              tooltipOptions={{ position: 'right' }}
            />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="component-library">
      <div className="component-library-content">
        {renderSection('Lights', lightTypes, 'light')}
        {renderSection('Meshes', meshTypes, 'mesh')}
        <div className="component-library-section">
          <h4>Groups</h4>
          <div className="component-types">
            <div className="component-type-item">
              <Button
                label="Group"
                icon="pi pi-folder"
                onClick={() => onAddComponent('group', 'group')}
                className="p-button-outlined w-full"
                tooltip="Container for organizing objects"
                tooltipOptions={{ position: 'right' }}
              />
            </div>
          </div>
        </div>
        {renderSection('Drei Helpers', helperTypes, 'helper')}
      </div>
    </div>
  )
}

