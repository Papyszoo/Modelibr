import './SceneNodeAnimation.css'

import { Dropdown } from 'primereact/dropdown'
import { InputSwitch } from 'primereact/inputswitch'
import { Slider } from 'primereact/slider'
import { type JSX, useMemo } from 'react'

import { useModelByIdQuery } from '@/features/models/api/queries'
import { NumberInput } from '@/shared/components'

import { SCENE_LIMITS } from '../api/sceneContract.generated'
import type { SceneAnimation, SceneNode } from '../types'

interface SceneNodeAnimationProps {
  node: SceneNode | null
  /**
   * Patches the selected node in the draft document. The editor's normal write
   * path - the next save carries it like any transform edit, and Ctrl+Z undoes
   * it.
   */
  onChange: (patch: Partial<SceneNode>) => void
}

/**
 * The selected node's playback and shape-key controls.
 *
 * Only shown when the node's own model actually carries clips or shape keys,
 * read from the model DTO's `technicalMetadata.animations` / `shapeKeys` - a
 * section full of controls that can do nothing is how a panel teaches people
 * to ignore it. The values written here are per placement: the same model
 * placed twice can play different clips at different offsets, which is the
 * reason the document carries animation on the node at all.
 */
export function SceneNodeAnimation({
  node,
  onChange,
}: SceneNodeAnimationProps): JSX.Element | null {
  const assetId = node?.asset?.assetType === 'Model' ? node.asset.assetId : null

  // The model detail query the rest of the app already uses, under the same
  // ['models', 'detail', id] key - this panel costs no second request shape.
  const { data: model } = useModelByIdQuery({
    modelId: assetId != null ? String(assetId) : '',
    queryConfig: {
      enabled: assetId != null,
      staleTime: 5 * 60 * 1000,
    },
  })

  const clips = useMemo(
    () => model?.technicalMetadata?.animations ?? [],
    [model]
  )

  // One weight per key NAME: the document stores a flat name -> weight map, so
  // the same name on two meshes is one slider, not two rows that silently fight.
  const shapeKeyNames = useMemo(() => {
    const names = new Set<string>()
    for (const group of model?.technicalMetadata?.shapeKeys ?? []) {
      for (const name of group.names) {
        names.add(name)
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [model])

  if (!node || node.asset?.assetType !== 'Model') {
    return null
  }

  if (clips.length === 0 && shapeKeyNames.length === 0) {
    return null
  }

  const animation = node.animation ?? null

  const writeClip = (clip: string | null) => {
    // "None" clears the field entirely. Switching clips keeps the loop/speed/
    // offset the user set for this placement - they describe how it performs,
    // not just what it performs.
    onChange({
      animation: clip === null ? null : { ...defaults(animation), clip },
    })
  }

  const updateAnimation = (patch: Partial<SceneAnimation>) => {
    if (!animation) {
      return
    }
    onChange({ animation: { ...animation, ...patch } })
  }

  const writeShapeKey = (name: string, weight: number) => {
    onChange({
      shapeKeys: { ...(node.shapeKeys ?? {}), [name]: weight },
    })
  }

  return (
    <section
      className="scene-node-animation"
      data-testid="scene-node-animation"
    >
      {clips.length > 0 ? (
        <div
          className="scene-node-animation-group"
          data-testid="scene-node-animation-group"
        >
          <h4>Animation</h4>

          <label className="scene-node-animation-field">
            <span>Clip</span>
            <Dropdown
              value={animation?.clip ?? null}
              options={[
                { label: 'None (rest pose)', value: null },
                ...clips.map(clip => ({
                  label: `${clip.name} - ${clip.durationSeconds.toFixed(2)} s`,
                  value: clip.name,
                })),
              ]}
              onChange={event =>
                writeClip(typeof event.value === 'string' ? event.value : null)
              }
              data-testid="scene-node-animation-clip"
            />
          </label>

          <div className="scene-node-animation-row">
            <label className="scene-node-animation-option">
              <InputSwitch
                checked={animation?.loop ?? true}
                disabled={animation === null}
                onChange={event =>
                  updateAnimation({ loop: Boolean(event.value) })
                }
                data-testid="scene-node-animation-loop"
              />
              <span>Loop</span>
            </label>

            <label className="scene-node-animation-option">
              <span>Speed</span>
              <NumberInput
                value={animation?.speed ?? 1}
                min={SCENE_LIMITS.minAnimationSpeed}
                max={SCENE_LIMITS.maxAnimationSpeed}
                step={0.1}
                disabled={animation === null}
                onChange={value =>
                  updateAnimation({
                    speed: clamp(
                      value,
                      SCENE_LIMITS.minAnimationSpeed,
                      SCENE_LIMITS.maxAnimationSpeed
                    ),
                  })
                }
                className="scene-node-animation-number"
                data-testid="scene-node-animation-speed"
              />
            </label>

            <label className="scene-node-animation-option">
              <span>Start offset (s)</span>
              <NumberInput
                value={animation?.timeOffset ?? 0}
                min={0}
                step={0.1}
                disabled={animation === null}
                onChange={value =>
                  updateAnimation({ timeOffset: Math.max(value, 0) })
                }
                className="scene-node-animation-number"
                data-testid="scene-node-animation-offset"
              />
            </label>
          </div>
        </div>
      ) : null}

      {shapeKeyNames.length > 0 ? (
        <div
          className="scene-node-animation-group"
          data-testid="scene-node-shapekeys"
        >
          <h4>Shape keys</h4>

          {shapeKeyNames.map(name => {
            const value = node.shapeKeys?.[name] ?? 0

            return (
              <div className="scene-node-animation-shapekey" key={name}>
                <span className="scene-node-animation-shapekey-name">
                  {name}
                </span>
                <Slider
                  value={value}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={event =>
                    writeShapeKey(name, clamp(sliderValue(event.value), 0, 1))
                  }
                  className="scene-node-animation-shapekey-slider"
                  data-testid={`scene-node-shapekey-${name}`}
                />
                <span className="scene-node-animation-shapekey-value">
                  {value.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

/** The defaults a freshly chosen clip starts with, as the document's own defaults. */
function defaults(animation: SceneAnimation | null): SceneAnimation {
  return {
    clip: '',
    loop: animation?.loop ?? true,
    speed: animation?.speed ?? 1,
    timeOffset: animation?.timeOffset ?? 0,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function sliderValue(value: number | [number, number]): number {
  return Array.isArray(value) ? value[0] : value
}
