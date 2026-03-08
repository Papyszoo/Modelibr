import { Button } from 'primereact/button'

import type { ComponentType } from '@/features/stage-editor/components/ComponentLibrary'
import type {
  StageConfig,
  StageGroup,
  StageObject,
} from '@/features/stage-editor/components/SceneEditor'

import { CodePanelWindow } from './CodePanelWindow'
import { ComponentLibraryWindow } from './ComponentLibraryWindow'
import { EditorCanvas } from './EditorCanvas'
import { PropertyPanelWindow } from './PropertyPanelWindow'
import { StageHierarchyWindow } from './StageHierarchyWindow'

interface EditorLayoutProps {
  side: 'left' | 'right'
  stageConfig: StageConfig
  selectedObjectId: string | null
  selectedObject: StageObject | null
  isSaving: boolean
  componentsWindowVisible: boolean
  setComponentsWindowVisible: (v: boolean) => void
  propertiesWindowVisible: boolean
  setPropertiesWindowVisible: (v: boolean) => void
  codeWindowVisible: boolean
  setCodeWindowVisible: (v: boolean) => void
  hierarchyWindowVisible: boolean
  setHierarchyWindowVisible: (v: boolean) => void
  onSelectObject: (id: string | null) => void
  onAddComponent: (category: ComponentType, type: string) => void
  onUpdateObject: (id: string, updates: Partial<StageObject>) => void
  onUpdateGroup: (id: string, updates: Partial<StageGroup>) => void
  onDeleteObject: (id: string) => void
  onSaveStage: () => void
}

export function EditorLayout({
  side,
  stageConfig,
  selectedObjectId,
  selectedObject,
  isSaving,
  componentsWindowVisible,
  setComponentsWindowVisible,
  propertiesWindowVisible,
  setPropertiesWindowVisible,
  codeWindowVisible,
  setCodeWindowVisible,
  hierarchyWindowVisible,
  setHierarchyWindowVisible,
  onSelectObject,
  onAddComponent,
  onUpdateObject,
  onUpdateGroup,
  onDeleteObject,
  onSaveStage,
}: EditorLayoutProps) {
  const buttonPosition = side === 'left' ? 'right' : 'left'

  return (
    <div className="editor-container">
      <div className={`editor-controls editor-controls-${buttonPosition}`}>
        <Button
          icon="pi pi-th-large"
          className="p-button-rounded editor-control-btn"
          onClick={() => setComponentsWindowVisible(!componentsWindowVisible)}
          tooltip="Components Library"
          tooltipOptions={{
            position: buttonPosition === 'left' ? 'right' : 'left',
          }}
        />
        <Button
          icon="pi pi-sitemap"
          className="p-button-rounded editor-control-btn"
          onClick={() => setHierarchyWindowVisible(!hierarchyWindowVisible)}
          tooltip="Hierarchy"
          tooltipOptions={{
            position: buttonPosition === 'left' ? 'right' : 'left',
          }}
        />
        <Button
          icon="pi pi-sliders-h"
          className="p-button-rounded editor-control-btn"
          onClick={() => setPropertiesWindowVisible(!propertiesWindowVisible)}
          tooltip="Properties"
          tooltipOptions={{
            position: buttonPosition === 'left' ? 'right' : 'left',
          }}
        />
        <Button
          icon="pi pi-code"
          className="p-button-rounded editor-control-btn"
          onClick={() => setCodeWindowVisible(!codeWindowVisible)}
          tooltip="Generated Code"
          tooltipOptions={{
            position: buttonPosition === 'left' ? 'right' : 'left',
          }}
        />
        <Button
          icon="pi pi-save"
          className="p-button-rounded editor-control-btn"
          onClick={onSaveStage}
          disabled={isSaving}
          tooltip={isSaving ? 'Saving...' : 'Save Stage'}
          tooltipOptions={{
            position: buttonPosition === 'left' ? 'right' : 'left',
          }}
        />
      </div>

      <EditorCanvas
        stageConfig={stageConfig}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
      />

      <ComponentLibraryWindow
        visible={componentsWindowVisible}
        onClose={() => setComponentsWindowVisible(false)}
        side={side}
        onAddComponent={onAddComponent}
      />
      <StageHierarchyWindow
        visible={hierarchyWindowVisible}
        onClose={() => setHierarchyWindowVisible(false)}
        side={side}
        stageConfig={stageConfig}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
        onDeleteObject={onDeleteObject}
        onUpdateGroup={onUpdateGroup}
      />
      <PropertyPanelWindow
        visible={propertiesWindowVisible}
        onClose={() => setPropertiesWindowVisible(false)}
        side={side}
        selectedObject={selectedObject}
        onUpdateObject={onUpdateObject}
        onDeleteObject={onDeleteObject}
      />
      <CodePanelWindow
        visible={codeWindowVisible}
        onClose={() => setCodeWindowVisible(false)}
        side={side}
        stageConfig={stageConfig}
      />
    </div>
  )
}
