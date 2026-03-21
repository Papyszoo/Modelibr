import './ViewerMenubar.css'

import { Menubar } from 'primereact/menubar'
import { type MenuItem } from 'primereact/menuitem'
import { Slider } from 'primereact/slider'
import { useMemo } from 'react'

import { useEnvironmentPresets } from '@/features/model-viewer/hooks/useEnvironmentPresets'
import {
  BUNDLED_PRESET,
  ENVIRONMENT_PRESETS,
} from '@/features/model-viewer/utils/environmentPresets'
import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'

export type PanelContent =
  | 'hierarchy'
  | 'materials'
  | 'modelInfo'
  | 'uvMap'
  | 'thumbnail'
  | null

interface ViewerMenubarProps {
  leftPanel: PanelContent
  rightPanel: PanelContent
  topPanel: PanelContent
  bottomPanel: PanelContent
  onLeftPanelChange: (panel: PanelContent) => void
  onRightPanelChange: (panel: PanelContent) => void
  onTopPanelChange: (panel: PanelContent) => void
  onBottomPanelChange: (panel: PanelContent) => void
  onAddVersion: () => void
}

const PANEL_OPTIONS: { label: string; value: PanelContent; icon: string }[] = [
  { label: 'Hierarchy', value: 'hierarchy', icon: 'pi pi-sitemap' },
  { label: 'Materials', value: 'materials', icon: 'pi pi-palette' },
  { label: 'Model Info', value: 'modelInfo', icon: 'pi pi-info-circle' },
  { label: 'UV Map', value: 'uvMap', icon: 'pi pi-map' },
  { label: 'Thumbnail Details', value: 'thumbnail', icon: 'pi pi-image' },
]

export function ViewerMenubar({
  leftPanel,
  rightPanel,
  topPanel,
  bottomPanel,
  onLeftPanelChange,
  onRightPanelChange,
  onTopPanelChange,
  onBottomPanelChange,
  onAddVersion,
}: ViewerMenubarProps) {
  const settings = useViewerSettingsStore(s => s.settings)
  const setSettings = useViewerSettingsStore(s => s.setSettings)
  const { isOnline, availablePresets } = useEnvironmentPresets(
    settings.environmentPreset
  )

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        label: 'File',
        icon: 'pi pi-file',
        items: [
          {
            label: 'Add New Version',
            icon: 'pi pi-plus',
            command: onAddVersion,
          },
        ],
      },
      {
        label: 'Viewer',
        icon: 'pi pi-eye',
        items: [
          {
            label: 'Viewer Options',
            icon: 'pi pi-cog',
            template: () => (
              <div
                className="viewer-options-menu"
                onClick={e => e.stopPropagation()}
              >
                <div className="viewer-option-group">
                  <div className="viewer-option-item">
                    <label>Orbit Speed</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.orbitSpeed}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            orbitSpeed: e.value as number,
                          })
                        }
                        min={0.1}
                        max={2}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.orbitSpeed.toFixed(1)}x
                      </span>
                    </div>
                  </div>

                  <div className="viewer-option-item">
                    <label>Zoom Speed</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.zoomSpeed}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            zoomSpeed: e.value as number,
                          })
                        }
                        min={0.1}
                        max={2}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.zoomSpeed.toFixed(1)}x
                      </span>
                    </div>
                  </div>

                  <div className="viewer-option-item">
                    <label>Pan Speed</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.panSpeed}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            panSpeed: e.value as number,
                          })
                        }
                        min={0.1}
                        max={2}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.panSpeed.toFixed(1)}x
                      </span>
                    </div>
                  </div>

                  <div className="viewer-option-item">
                    <label>Rotation Speed</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.modelRotationSpeed}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            modelRotationSpeed: e.value as number,
                          })
                        }
                        min={0}
                        max={0.02}
                        step={0.001}
                      />
                      <span className="viewer-option-value">
                        {settings.modelRotationSpeed === 0
                          ? 'Off'
                          : settings.modelRotationSpeed.toFixed(3)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="viewer-option-group">
                  <div className="viewer-option-item viewer-option-checkbox">
                    <label htmlFor="shadows-check">Shadows</label>
                    <input
                      id="shadows-check"
                      type="checkbox"
                      checked={settings.showShadows}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          showShadows: e.target.checked,
                        })
                      }
                    />
                  </div>

                  <div className="viewer-option-item viewer-option-checkbox">
                    <label htmlFor="fps-check">FPS Stats</label>
                    <input
                      id="fps-check"
                      type="checkbox"
                      checked={settings.showStats}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          showStats: e.target.checked,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="viewer-option-group">
                  <div className="viewer-option-item">
                    <label>Ambient Intensity</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.ambientIntensity}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            ambientIntensity: e.value as number,
                          })
                        }
                        min={0}
                        max={2}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.ambientIntensity.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="viewer-option-item">
                    <label>Directional Intensity</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.directionalIntensity}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            directionalIntensity: e.value as number,
                          })
                        }
                        min={0}
                        max={3}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.directionalIntensity.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="viewer-option-item viewer-option-checkbox">
                    <label htmlFor="light-helpers-check">Light Helpers</label>
                    <input
                      id="light-helpers-check"
                      type="checkbox"
                      checked={settings.showLightHelpers}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          showLightHelpers: e.target.checked,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="viewer-option-group">
                  <div className="viewer-option-item">
                    <label>Environment Preset</label>
                    <select
                      value={settings.environmentPreset}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          environmentPreset: e.target.value,
                        })
                      }
                      className="viewer-option-select"
                    >
                      {ENVIRONMENT_PRESETS.map(preset => {
                        const isAvailable = availablePresets.has(preset)
                        const isBundled = preset === BUNDLED_PRESET
                        let label = preset
                        if (!isOnline && !isAvailable && !isBundled) {
                          label = `${preset} (offline)`
                        }
                        return (
                          <option
                            key={preset}
                            value={preset}
                            disabled={!isAvailable}
                          >
                            {label}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div className="viewer-option-item viewer-option-checkbox">
                    <label htmlFor="env-bg-check">Background</label>
                    <input
                      id="env-bg-check"
                      type="checkbox"
                      checked={settings.showEnvironmentBackground}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          showEnvironmentBackground: e.target.checked,
                        })
                      }
                    />
                  </div>

                  <div className="viewer-option-item">
                    <label>Background Intensity</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.backgroundIntensity}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            backgroundIntensity: e.value as number,
                          })
                        }
                        min={0}
                        max={2}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.backgroundIntensity.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="viewer-option-item">
                    <label>Environment Intensity</label>
                    <div className="viewer-option-control">
                      <Slider
                        value={settings.environmentIntensity}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            environmentIntensity: e.value as number,
                          })
                        }
                        min={0}
                        max={2}
                        step={0.1}
                      />
                      <span className="viewer-option-value">
                        {settings.environmentIntensity.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
        ],
      },
      {
        label: 'Left Panel',
        icon: 'pi pi-arrow-left',
        items: [
          {
            label: 'None',
            icon: leftPanel === null ? 'pi pi-check' : 'pi pi-minus',
            command: () => onLeftPanelChange(null),
          },
          { separator: true },
          ...PANEL_OPTIONS.map(opt => ({
            label: opt.label,
            icon: leftPanel === opt.value ? 'pi pi-check' : opt.icon,
            command: () =>
              onLeftPanelChange(leftPanel === opt.value ? null : opt.value),
          })),
        ],
      },
      {
        label: 'Right Panel',
        icon: 'pi pi-arrow-right',
        items: [
          {
            label: 'None',
            icon: rightPanel === null ? 'pi pi-check' : 'pi pi-minus',
            command: () => onRightPanelChange(null),
          },
          { separator: true },
          ...PANEL_OPTIONS.map(opt => ({
            label: opt.label,
            icon: rightPanel === opt.value ? 'pi pi-check' : opt.icon,
            command: () =>
              onRightPanelChange(rightPanel === opt.value ? null : opt.value),
          })),
        ],
      },
      {
        label: 'Top Panel',
        icon: 'pi pi-arrow-up',
        items: [
          {
            label: 'None',
            icon: topPanel === null ? 'pi pi-check' : 'pi pi-minus',
            command: () => onTopPanelChange(null),
          },
          { separator: true },
          ...PANEL_OPTIONS.map(opt => ({
            label: opt.label,
            icon: topPanel === opt.value ? 'pi pi-check' : opt.icon,
            command: () =>
              onTopPanelChange(topPanel === opt.value ? null : opt.value),
          })),
        ],
      },
      {
        label: 'Bottom Panel',
        icon: 'pi pi-arrow-down',
        items: [
          {
            label: 'None',
            icon: bottomPanel === null ? 'pi pi-check' : 'pi pi-minus',
            command: () => onBottomPanelChange(null),
          },
          { separator: true },
          ...PANEL_OPTIONS.map(opt => ({
            label: opt.label,
            icon: bottomPanel === opt.value ? 'pi pi-check' : opt.icon,
            command: () =>
              onBottomPanelChange(bottomPanel === opt.value ? null : opt.value),
          })),
        ],
      },
    ],
    [
      leftPanel,
      rightPanel,
      topPanel,
      bottomPanel,
      settings,
      isOnline,
      availablePresets,
      onLeftPanelChange,
      onRightPanelChange,
      onTopPanelChange,
      onBottomPanelChange,
      onAddVersion,
      setSettings,
    ]
  )

  return (
    <Menubar
      model={menuItems}
      className="viewer-menubar"
      data-testid="viewer-menubar"
    />
  )
}
