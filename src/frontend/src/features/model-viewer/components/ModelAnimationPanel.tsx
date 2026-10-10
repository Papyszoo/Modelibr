import './ModelAnimationPanel.css'

import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { InputSwitch } from 'primereact/inputswitch'
import { Slider } from 'primereact/slider'
import { useSyncExternalStore } from 'react'

import { type ModelAnimationController } from '../animation/ModelAnimationController'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
const SPEED_OPTIONS = SPEEDS.map(speed => ({
  label: `${speed}x`,
  value: speed,
}))

/**
 * Playback and shape-key controls for the model currently in the viewer.
 *
 * The panel owns no state: everything comes from the shared controller's
 * snapshot and goes back through its methods, so the scene and the panel can
 * never disagree about what is playing.
 */
export function ModelAnimationPanel({
  controller,
}: {
  controller: ModelAnimationController
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  )

  const { clips, shapeKeyGroups } = snapshot
  if (clips.length === 0 && shapeKeyGroups.length === 0) {
    return null
  }

  const clipOptions = clips.map((clip, index) => ({
    label: `${clip.name} - ${clip.duration.toFixed(2)} s`,
    value: index,
  }))

  const shapeKeyValue = (meshName: string, key: string) =>
    snapshot.shapeKeyValues.find(
      value => value.meshName === meshName && value.key === key
    )?.value ?? 0

  return (
    <div className="model-info-section" data-testid="model-animation-panel">
      <h3 className="model-info-title">Animation</h3>

      {clips.length > 0 && (
        <div className="model-animation-playback">
          <label className="model-animation-field">
            <span className="model-animation-field-label">Clip</span>
            <Dropdown
              value={snapshot.activeClipIndex}
              options={clipOptions}
              optionLabel="label"
              optionValue="value"
              onChange={event => controller.selectClip(Number(event.value))}
              className="model-animation-clip-select"
              data-testid="animation-clip-select"
            />
          </label>

          <div className="model-animation-transport">
            <Button
              icon={snapshot.playing ? 'pi pi-pause' : 'pi pi-play'}
              aria-label={snapshot.playing ? 'Pause' : 'Play'}
              tooltip={snapshot.playing ? 'Pause' : 'Play'}
              tooltipOptions={{ position: 'top' }}
              className="p-button-sm p-button-text model-animation-play"
              onClick={() => controller.toggle()}
              data-testid="animation-play-toggle"
            />
            <span className="model-animation-time" data-testid="animation-time">
              {snapshot.time.toFixed(2)} / {snapshot.duration.toFixed(2)} s
            </span>
          </div>

          <Slider
            value={snapshot.time}
            min={0}
            max={Math.max(snapshot.duration, 0.01)}
            step={0.01}
            disabled={snapshot.duration === 0}
            onChange={event => controller.setTime(Number(event.value))}
            className="model-animation-scrub"
            data-testid="animation-scrub"
          />

          <div className="model-animation-options">
            <label className="model-animation-option">
              <InputSwitch
                checked={snapshot.loop}
                onChange={event => controller.setLoop(Boolean(event.value))}
                data-testid="animation-loop-toggle"
              />
              <span>Loop</span>
            </label>

            <label className="model-animation-option">
              <span>Speed</span>
              <Dropdown
                value={snapshot.speed}
                options={SPEED_OPTIONS}
                optionLabel="label"
                optionValue="value"
                onChange={event => controller.setSpeed(Number(event.value))}
                className="model-animation-speed-select"
                data-testid="animation-speed-select"
              />
            </label>
          </div>
        </div>
      )}

      {shapeKeyGroups.length > 0 && (
        <div className="model-animation-shapekeys">
          <div className="model-animation-shapekeys-header">
            <span className="model-animation-subtitle">Shape Keys</span>
            <Button
              label="Reset shape keys"
              icon="pi pi-replay"
              className="p-button-sm p-button-text"
              onClick={() => controller.resetShapeKeys()}
              data-testid="animation-reset-shapekeys"
            />
          </div>

          {shapeKeyGroups.map((group, groupIndex) => (
            <div
              className="model-animation-shapekey-group"
              key={`${group.meshName}-${groupIndex}`}
            >
              <div className="model-animation-shapekey-group-title">
                {group.meshName || 'Mesh'}
              </div>
              {group.keys.map(key => {
                const value = shapeKeyValue(group.meshName, key)
                return (
                  <div className="model-animation-shapekey-row" key={key}>
                    <span className="model-animation-shapekey-name">{key}</span>
                    <Slider
                      value={value}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={snapshot.morphPlaying}
                      onChange={event =>
                        controller.setShapeKey(
                          group.meshName,
                          key,
                          Number(event.value)
                        )
                      }
                      className="model-animation-shapekey-slider"
                      data-testid={`animation-shapekey-${key}`}
                    />
                    <span className="model-animation-shapekey-value">
                      {value.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
