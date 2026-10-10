import { type JSX, type ReactNode, useState } from 'react'

import { NumberInput } from '@/shared/components'

import { useVfxAssetInfo } from '../hooks/useVfxAssets'
import {
  DEFAULT_PRIMITIVE_COLOR,
  isPrimitiveMesh,
  type VfxComponent,
  type VfxEmitter,
  type VfxKeyframe,
  type VfxMesh,
  type VfxParticles,
  type VfxProblem,
  type VfxTrackName,
  vfxTracksFor,
} from '../types'
import { type VfxAssetKind, VfxAssetPicker } from './VfxAssetPicker'

interface VfxInspectorProps {
  component: VfxComponent
  effectDuration: number
  /** Effect time, so a new keyframe lands where the playhead is. */
  time: number
  problems: VfxProblem[]
  onChange: (next: VfxComponent) => void
  onDelete: () => void
}

const TRACK_LABELS: Record<VfxTrackName, string> = {
  scale: 'Scale',
  opacity: 'Opacity',
  rotationY: 'Rotation Y (deg)',
  intensity: 'Intensity',
  radius: 'Radius (m)',
}

const TRACK_DEFAULTS: Record<VfxTrackName, number> = {
  scale: 1,
  opacity: 1,
  rotationY: 0,
  intensity: 1,
  radius: 1,
}

/** The radius a new disc/ring primitive starts at, in metres. */
const DEFAULT_PRIMITIVE_RADIUS = 3

/** A new emitter of `shape`, carrying over any radius the previous one had. */
function defaultEmitter(
  shape: VfxEmitter['shape'],
  previous: VfxEmitter | undefined
): VfxEmitter {
  if (shape === 'disc')
    return {
      shape,
      radius: previous?.radius ?? previous?.outerRadius ?? 2,
    }
  if (shape === 'ring')
    return {
      shape,
      innerRadius: previous?.innerRadius ?? 1,
      outerRadius: previous?.outerRadius ?? previous?.radius ?? 3,
    }
  return { shape: 'point' }
}

/** What a new radius keyframe starts at: the component's authored radius. */
function radiusDefault(component: VfxComponent): number {
  const mesh = component.mesh
  if (mesh?.kind === 'disc') return mesh.radius ?? TRACK_DEFAULTS.radius
  if (mesh?.kind === 'ring') return mesh.outerRadius ?? TRACK_DEFAULTS.radius
  const emitter = component.emitter
  if (emitter?.shape === 'disc') return emitter.radius ?? TRACK_DEFAULTS.radius
  if (emitter?.shape === 'ring')
    return emitter.outerRadius ?? TRACK_DEFAULTS.radius
  return TRACK_DEFAULTS.radius
}

/** `tracks` without `radius`, kept as-is when it had none to begin with. */
function withoutRadius(tracks: VfxComponent['tracks']): VfxComponent['tracks'] {
  if (!tracks || tracks.radius === undefined) return tracks
  const next = { ...tracks }
  delete next.radius
  return next
}

/** Edits one component: its timing, its own settings, and its keyframes. */
export function VfxInspector({
  component,
  effectDuration,
  time,
  problems,
  onChange,
  onDelete,
}: VfxInspectorProps): JSX.Element {
  const set = (patch: Partial<VfxComponent>) =>
    onChange({ ...component, ...patch })
  const position = component.position ?? [0, 0, 0]

  return (
    <aside className="vfx-inspector" data-testid="vfx-inspector">
      <header className="vfx-inspector-header">
        <input
          className="vfx-inspector-name"
          aria-label="Component name"
          value={component.name}
          maxLength={100}
          onChange={event => set({ name: event.target.value })}
        />
        <button
          type="button"
          className="vfx-icon-button vfx-danger"
          onClick={onDelete}
          aria-label={`Remove ${component.name}`}
        >
          <i className="pi pi-trash" aria-hidden="true" />
        </button>
      </header>

      {problems.length > 0 ? (
        <ul className="vfx-problems" data-testid="vfx-component-problems">
          {problems.map(problem => (
            <li key={`${problem.path}-${problem.message}`}>
              {problem.message}
            </li>
          ))}
        </ul>
      ) : null}

      <Section title="Timing">
        <NumberField
          label="Start (s)"
          value={component.start}
          min={0}
          max={Math.max(0, effectDuration - component.duration)}
          step={0.05}
          onChange={start => set({ start })}
        />
        <NumberField
          label="Duration (s)"
          value={component.duration}
          min={0.05}
          max={effectDuration - component.start}
          step={0.05}
          onChange={duration => set({ duration })}
        />
      </Section>

      {component.type !== 'sound' ? (
        <Section title="Position" columns={3}>
          {(['X', 'Y', 'Z'] as const).map((axis, index) => (
            <NumberField
              key={axis}
              label={axis}
              value={position[index]}
              step={0.1}
              onChange={value => {
                const next = [...position] as [number, number, number]
                next[index] = value
                set({ position: next })
              }}
            />
          ))}
        </Section>
      ) : null}

      {component.particles ? (
        <>
          <ParticlesFields
            particles={component.particles}
            onChange={particles => set({ particles })}
          />
          <EmitterFields
            emitter={component.emitter}
            onChange={emitter =>
              set({
                emitter,
                tracks:
                  emitter?.shape === 'point'
                    ? withoutRadius(component.tracks)
                    : component.tracks,
              })
            }
          />
        </>
      ) : null}

      {component.mesh ? (
        <Section title="Mesh">
          <label className="vfx-field">
            <span>Primitive</span>
            <select
              value={component.mesh.kind ?? 'model'}
              onChange={event => {
                const shape = event.target.value
                const previous = component.mesh!
                if (shape === 'model') {
                  set({
                    mesh: {
                      modelId: previous.kind ? 0 : (previous.modelId ?? 0),
                      versionId: previous.kind
                        ? null
                        : (previous.versionId ?? null),
                    },
                    tracks: withoutRadius(component.tracks),
                  })
                  return
                }
                set({
                  mesh:
                    shape === 'disc'
                      ? {
                          kind: 'disc',
                          radius:
                            previous.radius ??
                            previous.outerRadius ??
                            DEFAULT_PRIMITIVE_RADIUS,
                        }
                      : {
                          kind: 'ring',
                          innerRadius: previous.innerRadius ?? 1,
                          outerRadius:
                            previous.outerRadius ??
                            previous.radius ??
                            DEFAULT_PRIMITIVE_RADIUS,
                        },
                })
              }}
            >
              <option value="model">Library model</option>
              <option value="disc">Disc</option>
              <option value="ring">Ring</option>
            </select>
          </label>
          {isPrimitiveMesh(component.mesh) ? (
            <MeshPrimitiveFields
              mesh={component.mesh}
              onChange={mesh => set({ mesh })}
            />
          ) : (
            <AssetField
              kind="model"
              id={component.mesh.modelId ?? null}
              onPick={asset =>
                set({
                  mesh: {
                    modelId: asset.id,
                    versionId: asset.versionId ?? null,
                  },
                })
              }
            />
          )}
        </Section>
      ) : null}

      {component.light ? (
        <Section title="Light">
          <ColorField
            label="Colour"
            value={component.light.color}
            onChange={color => set({ light: { ...component.light!, color } })}
          />
          <NumberField
            label="Range"
            value={component.light.range}
            min={0.1}
            step={0.5}
            onChange={range => set({ light: { ...component.light!, range } })}
          />
        </Section>
      ) : null}

      {component.sound ? (
        <Section title="Sound">
          <AssetField
            kind="sound"
            id={component.sound.soundId}
            onPick={asset =>
              set({ sound: { ...component.sound!, soundId: asset.id } })
            }
          />
          <NumberField
            label="Volume"
            value={component.sound.volume}
            min={0}
            max={1}
            step={0.05}
            onChange={volume => set({ sound: { ...component.sound!, volume } })}
          />
        </Section>
      ) : null}

      {vfxTracksFor(component).map(track => (
        <TrackEditor
          key={track}
          track={track}
          keys={component.tracks?.[track] ?? []}
          defaultValue={
            track === 'radius'
              ? radiusDefault(component)
              : TRACK_DEFAULTS[track]
          }
          componentDuration={component.duration}
          localTime={Math.min(
            Math.max(0, time - component.start),
            component.duration
          )}
          onChange={keys =>
            set({ tracks: { ...component.tracks, [track]: keys } })
          }
        />
      ))}
    </aside>
  )
}

function ParticlesFields({
  particles,
  onChange,
}: {
  particles: VfxParticles
  onChange: (next: VfxParticles) => void
}): JSX.Element {
  const set = (patch: Partial<VfxParticles>) =>
    onChange({ ...particles, ...patch })

  return (
    <>
      <Section title="Emission">
        <label className="vfx-field">
          <span>Mode</span>
          <select
            value={particles.mode}
            onChange={event =>
              set({ mode: event.target.value as VfxParticles['mode'] })
            }
          >
            <option value="continuous">Continuous</option>
            <option value="burst">Burst</option>
          </select>
        </label>
        {particles.mode === 'continuous' ? (
          <NumberField
            label="Rate (/s)"
            value={particles.rate}
            min={0}
            max={2000}
            step={5}
            onChange={rate => set({ rate })}
          />
        ) : (
          <NumberField
            label="Count"
            value={particles.count}
            min={1}
            max={5000}
            step={10}
            onChange={count => set({ count: Math.round(count) })}
          />
        )}
        <NumberField
          label="Lifetime (s)"
          value={particles.lifetime}
          min={0.05}
          max={10}
          step={0.05}
          onChange={lifetime => set({ lifetime })}
        />
        <NumberField
          label="Speed"
          value={particles.speed}
          min={0}
          step={0.1}
          onChange={speed => set({ speed })}
        />
        <NumberField
          label="Spread (deg)"
          value={particles.spread}
          min={0}
          max={180}
          step={1}
          onChange={spread => set({ spread })}
        />
        <NumberField
          label="Gravity"
          value={particles.gravity}
          step={0.5}
          onChange={gravity => set({ gravity })}
        />
        <label className="vfx-field">
          <span>Seed</span>
          <span className="vfx-field-inline">
            <NumberInput
              value={particles.seed}
              step={1}
              onChange={value => set({ seed: Math.round(value) })}
            />
            <button
              type="button"
              className="vfx-icon-button"
              aria-label="New random seed"
              onClick={() => set({ seed: Math.floor(Math.random() * 100000) })}
            >
              <i className="pi pi-refresh" aria-hidden="true" />
            </button>
          </span>
        </label>
      </Section>

      <Section title="Over life">
        <NumberField
          label="Size start"
          value={particles.sizeStart}
          min={0}
          step={0.01}
          onChange={sizeStart => set({ sizeStart })}
        />
        <NumberField
          label="Size end"
          value={particles.sizeEnd}
          min={0}
          step={0.01}
          onChange={sizeEnd => set({ sizeEnd })}
        />
        <ColorField
          label="Colour start"
          value={particles.colorStart}
          onChange={colorStart => set({ colorStart })}
        />
        <ColorField
          label="Colour end"
          value={particles.colorEnd}
          onChange={colorEnd => set({ colorEnd })}
        />
        <NumberField
          label="Opacity start"
          value={particles.opacityStart}
          min={0}
          max={1}
          step={0.05}
          onChange={opacityStart => set({ opacityStart })}
        />
        <NumberField
          label="Opacity end"
          value={particles.opacityEnd}
          min={0}
          max={1}
          step={0.05}
          onChange={opacityEnd => set({ opacityEnd })}
        />
      </Section>

      <Section title="Look">
        <label className="vfx-field">
          <span>Blending</span>
          <select
            value={particles.blending}
            onChange={event =>
              set({ blending: event.target.value as VfxParticles['blending'] })
            }
          >
            <option value="additive">Additive (glow)</option>
            <option value="normal">Normal (smoke)</option>
          </select>
        </label>
        <AssetField
          kind="sprite"
          id={particles.spriteId ?? null}
          optional
          onPick={asset => set({ spriteId: asset.id })}
          onClear={() => set({ spriteId: null })}
        />
      </Section>
    </>
  )
}

/**
 * The emitter shape of a particles component. In the definition it lives on the
 * component, next to `particles`, which is where the server and the Godot export
 * read it.
 */
function EmitterFields({
  emitter,
  onChange,
}: {
  emitter: VfxEmitter | undefined
  onChange: (emitter: VfxEmitter) => void
}): JSX.Element {
  const shape = emitter?.shape ?? 'point'
  const setShape = (next: VfxEmitter['shape']) =>
    onChange(defaultEmitter(next, emitter))

  return (
    <Section title="Emitter">
      <label className="vfx-field">
        <span>Emitter shape</span>
        <select
          value={shape}
          onChange={event =>
            setShape(event.target.value as VfxEmitter['shape'])
          }
        >
          <option value="point">Point</option>
          <option value="disc">Disc</option>
          <option value="ring">Ring</option>
        </select>
      </label>
      {shape === 'disc' ? (
        <NumberField
          label="Radius (m)"
          value={emitter?.radius ?? 1}
          min={0.1}
          max={20}
          step={0.1}
          onChange={radius => onChange({ shape: 'disc', radius })}
        />
      ) : null}
      {shape === 'ring' ? (
        <>
          <NumberField
            label="Inner radius (m)"
            value={emitter?.innerRadius ?? 0}
            min={0}
            max={20}
            step={0.1}
            onChange={innerRadius =>
              onChange({
                ...(emitter ?? { shape: 'ring' }),
                shape: 'ring',
                innerRadius,
              })
            }
          />
          <NumberField
            label="Outer radius (m)"
            value={emitter?.outerRadius ?? 1}
            min={0.1}
            max={20}
            step={0.1}
            onChange={outerRadius =>
              onChange({
                ...(emitter ?? { shape: 'ring' }),
                shape: 'ring',
                outerRadius,
              })
            }
          />
        </>
      ) : null}
    </Section>
  )
}

/** The radii and material of a flat disc or ring primitive. */
function MeshPrimitiveFields({
  mesh,
  onChange,
}: {
  mesh: VfxMesh
  onChange: (mesh: VfxMesh) => void
}): JSX.Element {
  const set = (patch: Partial<VfxMesh>) => onChange({ ...mesh, ...patch })

  return (
    <>
      {mesh.kind === 'disc' ? (
        <NumberField
          label="Radius (m)"
          value={mesh.radius ?? 1}
          min={0.1}
          max={20}
          step={0.1}
          onChange={radius => set({ radius })}
        />
      ) : (
        <>
          <NumberField
            label="Inner radius (m)"
            value={mesh.innerRadius ?? 0}
            min={0}
            max={20}
            step={0.1}
            onChange={innerRadius => set({ innerRadius })}
          />
          <NumberField
            label="Outer radius (m)"
            value={mesh.outerRadius ?? 1}
            min={0.1}
            max={20}
            step={0.1}
            onChange={outerRadius => set({ outerRadius })}
          />
        </>
      )}
      <ColorField
        label="Colour"
        value={mesh.color ?? DEFAULT_PRIMITIVE_COLOR}
        onChange={color => set({ color })}
      />
      <NumberField
        label="Emissive"
        value={mesh.emissiveIntensity ?? 0}
        min={0}
        max={10}
        step={0.1}
        onChange={emissiveIntensity => set({ emissiveIntensity })}
      />
    </>
  )
}

function TrackEditor({
  track,
  keys,
  defaultValue,
  componentDuration,
  localTime,
  onChange,
}: {
  track: VfxTrackName
  keys: VfxKeyframe[]
  defaultValue: number
  componentDuration: number
  localTime: number
  onChange: (keys: VfxKeyframe[]) => void
}): JSX.Element {
  const sorted = (next: VfxKeyframe[]) => [...next].sort((a, b) => a[0] - b[0])

  const addAtPlayhead = () => {
    const t = Number(localTime.toFixed(2))
    // Store what the field shows now (`defaultValue` is the component's current
    // authored value), not the previously keyed value sampled from the track.
    onChange(
      sorted([
        ...keys.filter(([k]) => k !== t),
        [t, Number(defaultValue.toFixed(3))],
      ])
    )
  }

  return (
    <Section title={`${TRACK_LABELS[track]} keyframes`}>
      <div className="vfx-keys" data-testid={`vfx-track-${track}`}>
        {keys.length === 0 ? (
          <p className="vfx-muted">No keyframes - stays at {defaultValue}.</p>
        ) : (
          keys.map(([t, value], index) => (
            <div key={index} className="vfx-key-row">
              <NumberInput
                aria-label="Keyframe time (s)"
                value={t}
                min={0}
                max={componentDuration}
                step={0.05}
                onChange={value => {
                  const next = keys.map(
                    (key, i): VfxKeyframe =>
                      i === index
                        ? [
                            Math.min(componentDuration, Math.max(0, value)),
                            key[1],
                          ]
                        : key
                  )
                  onChange(sorted(next))
                }}
              />
              <NumberInput
                aria-label="Keyframe value"
                value={value}
                step={track === 'rotationY' ? 15 : 0.1}
                onChange={next => {
                  const updated = keys.map(
                    (key, i): VfxKeyframe =>
                      i === index ? [key[0], next] : key
                  )
                  onChange(updated)
                }}
              />
              <button
                type="button"
                className="vfx-icon-button"
                aria-label="Remove keyframe"
                onClick={() => onChange(keys.filter((_, i) => i !== index))}
              >
                <i className="pi pi-minus" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          className="vfx-text-button"
          onClick={addAtPlayhead}
        >
          <i className="pi pi-plus" aria-hidden="true" /> Key at playhead
        </button>
      </div>
    </Section>
  )
}

function AssetField({
  kind,
  id,
  optional = false,
  onPick,
  onClear,
}: {
  kind: VfxAssetKind
  id: number | null
  optional?: boolean
  onPick: (asset: { id: number; versionId?: number | null }) => void
  onClear?: () => void
}): JSX.Element {
  const [picking, setPicking] = useState(false)
  const { data } = useVfxAssetInfo(kind, id)
  const label = id ? (data?.name ?? `#${id}`) : optional ? 'None' : 'Not chosen'

  return (
    <div className="vfx-field vfx-asset-field">
      <span>
        {kind === 'model' ? 'Model' : kind === 'sound' ? 'Sound' : 'Sprite'}
      </span>
      <span className="vfx-field-inline">
        <button
          type="button"
          className="vfx-text-button"
          onClick={() => setPicking(open => !open)}
          data-testid={`vfx-asset-${kind}`}
        >
          {label}
        </button>
        {optional && id ? (
          <button
            type="button"
            className="vfx-icon-button"
            aria-label={`Remove the ${kind}`}
            onClick={onClear}
          >
            <i className="pi pi-times" aria-hidden="true" />
          </button>
        ) : null}
      </span>
      {picking ? (
        <VfxAssetPicker
          kind={kind}
          onCancel={() => setPicking(false)}
          onPick={asset => {
            onPick(asset)
            setPicking(false)
          }}
        />
      ) : null}
    </div>
  )
}

function Section({
  title,
  columns = 2,
  children,
}: {
  title: string
  columns?: 2 | 3
  children: ReactNode
}): JSX.Element {
  return (
    <section className="vfx-section">
      <h4>{title}</h4>
      <div
        className={`vfx-section-body${columns === 3 ? ' vfx-section-body-3' : ''}`}
      >
        {children}
      </div>
    </section>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <label className="vfx-field">
      <span>{label}</span>
      <NumberInput
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <label className="vfx-field">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  )
}
