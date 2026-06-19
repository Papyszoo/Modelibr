// Reuse the model-page viewer-menubar styling (menubar chrome + viewer-options
// popover layout) so the script preview matches it.
import '@/features/model-viewer/components/ViewerMenubar.css'

import { Button } from 'primereact/button'
import { Menubar } from 'primereact/menubar'
import { type MenuItem } from 'primereact/menuitem'
import { Slider } from 'primereact/slider'
import { useMemo } from 'react'

import {
  type PreviewGeometry,
  type PreviewPanelPosition,
} from '@/stores/scriptPreviewStore'
import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'

import { type PreviewKind } from '../utils/languages'

export interface PreviewModelOption {
  id: number
  name: string
}

interface ScriptViewerMenubarProps {
  previewKind: PreviewKind | null
  showPreview: boolean
  onTogglePreview: () => void
  onRun: () => void
  runDisabled: boolean
  geometry: PreviewGeometry
  onGeometryChange: (geometry: PreviewGeometry) => void
  modelId: number | null
  models: PreviewModelOption[]
  onModelChange: (modelId: number | null) => void
  panelPosition: PreviewPanelPosition
  onPanelPositionChange: (position: PreviewPanelPosition) => void
  onDownload: () => void
  downloadDisabled: boolean
  onSave: () => void
  saveDisabled: boolean
  isSaving: boolean
}

const GEOMETRIES: { value: PreviewGeometry; label: string; icon: string }[] = [
  { value: 'sphere', label: 'Sphere', icon: 'pi pi-circle' },
  { value: 'box', label: 'Cube', icon: 'pi pi-stop' },
  { value: 'plane', label: 'Plane', icon: 'pi pi-clone' },
  { value: 'cylinder', label: 'Cylinder', icon: 'pi pi-tablet' },
  { value: 'torus', label: 'Torus', icon: 'pi pi-circle-off' },
]

function check(active: boolean, fallback: string): string {
  return active ? 'pi pi-check' : fallback
}

export function ScriptViewerMenubar({
  previewKind,
  showPreview,
  onTogglePreview,
  onRun,
  runDisabled,
  geometry,
  onGeometryChange,
  modelId,
  models,
  onModelChange,
  panelPosition,
  onPanelPositionChange,
  onDownload,
  downloadDisabled,
  onSave,
  saveDisabled,
  isSaving,
}: ScriptViewerMenubarProps) {
  const settings = useViewerSettingsStore(s => s.settings)
  const setSetting = useViewerSettingsStore(s => s.setSetting)

  const isScene = previewKind === 'scene'

  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = []

    if (isScene) {
      items.push({
        label: 'Geometry',
        icon: 'pi pi-box',
        items: [
          ...GEOMETRIES.map(g => ({
            label: g.label,
            icon: check(modelId === null && geometry === g.value, g.icon),
            command: () => onGeometryChange(g.value),
          })),
          { separator: true },
          {
            label: 'Apply to model',
            icon: 'pi pi-sitemap',
            items: [
              {
                label: 'None (use primitive)',
                icon: check(modelId === null, 'pi pi-minus'),
                command: () => onModelChange(null),
              },
              ...(models.length > 0
                ? [{ separator: true }, ...buildModelItems()]
                : [{ label: 'No models in library', disabled: true }]),
            ],
          },
        ],
      })

      items.push({
        label: 'Viewer',
        icon: 'pi pi-cog',
        items: [
          {
            label: 'Viewer Options',
            template: () => (
              <div
                className="viewer-options-menu"
                onClick={e => e.stopPropagation()}
              >
                {viewerSlider(
                  'Orbit Speed',
                  settings.orbitSpeed,
                  0.1,
                  2,
                  0.1,
                  v => setSetting('orbitSpeed', v)
                )}
                {viewerSlider(
                  'Zoom Speed',
                  settings.zoomSpeed,
                  0.1,
                  2,
                  0.1,
                  v => setSetting('zoomSpeed', v)
                )}
                {viewerSlider('Pan Speed', settings.panSpeed, 0.1, 2, 0.1, v =>
                  setSetting('panSpeed', v)
                )}
                {viewerSlider(
                  'Rotation',
                  settings.modelRotationSpeed,
                  0,
                  0.02,
                  0.001,
                  v => setSetting('modelRotationSpeed', v)
                )}
                {viewerSlider(
                  'Ambient Light',
                  settings.ambientIntensity,
                  0,
                  2,
                  0.1,
                  v => setSetting('ambientIntensity', v)
                )}
                {viewerSlider(
                  'Directional Light',
                  settings.directionalIntensity,
                  0,
                  3,
                  0.1,
                  v => setSetting('directionalIntensity', v)
                )}
              </div>
            ),
          },
        ],
      })
    }

    items.push({
      label: 'Layout',
      icon: 'pi pi-table',
      items: [
        {
          label: 'Preview on the right',
          icon: check(panelPosition === 'right', 'pi pi-arrow-right'),
          command: () => onPanelPositionChange('right'),
        },
        {
          label: 'Preview below',
          icon: check(panelPosition === 'bottom', 'pi pi-arrow-down'),
          command: () => onPanelPositionChange('bottom'),
        },
      ],
    })

    return items

    function buildModelItems(): MenuItem[] {
      return models.map(m => ({
        label: m.name,
        icon: check(modelId === m.id, 'pi pi-box'),
        command: () => onModelChange(m.id),
      }))
    }
  }, [
    isScene,
    geometry,
    modelId,
    models,
    panelPosition,
    settings,
    onGeometryChange,
    onModelChange,
    onPanelPositionChange,
    setSetting,
  ])

  const end = (
    <div className="script-viewer-actions">
      {previewKind && (
        <Button
          label={showPreview ? 'Hide Preview' : 'Show Preview'}
          icon="pi pi-eye"
          className="p-button-text p-button-sm"
          onClick={onTogglePreview}
          data-testid="script-preview-button"
        />
      )}
      {isScene && showPreview && (
        <Button
          label="Run"
          icon="pi pi-play"
          className="p-button-sm"
          onClick={onRun}
          disabled={runDisabled}
          tooltip="Run the script in the preview"
          tooltipOptions={{ position: 'bottom' }}
          data-testid="script-run"
        />
      )}
      <Button
        label="Download"
        icon="pi pi-download"
        className="p-button-text p-button-sm"
        onClick={onDownload}
        disabled={downloadDisabled}
      />
      <Button
        label={isSaving ? 'Saving...' : 'Save'}
        icon="pi pi-save"
        className="p-button-sm"
        onClick={onSave}
        disabled={saveDisabled}
        data-testid="script-save"
      />
    </div>
  )

  return (
    <Menubar
      model={menuItems}
      end={end}
      className="viewer-menubar script-viewer-menubar"
      data-testid="script-viewer-menubar"
    />
  )
}

function viewerSlider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void
) {
  return (
    <div className="viewer-option-item">
      <label>{label}</label>
      <div className="viewer-option-control">
        <Slider
          value={value}
          onChange={e => onChange(e.value as number)}
          min={min}
          max={max}
          step={step}
        />
        <span className="viewer-option-value">
          {value.toFixed(step < 0.01 ? 3 : 1)}
        </span>
      </div>
    </div>
  )
}
