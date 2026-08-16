import './ScenePropertyPanel.css'

import { type JSX } from 'react'

import type {
  SceneNode,
  SceneNodeView,
  SceneScaleWarning,
  SceneTransform,
  Vec3,
} from '../types'

interface ScenePropertyPanelProps {
  node: SceneNode | null
  facts: SceneNodeView | null
  warnings: SceneScaleWarning[]
  /**
   * How far this node would move on Y to rest on the ground, or null when that
   * is unknown - either the asset has no derived bounds, or the node has moved
   * since the server last measured it.
   */
  groundOffset: number | null
  onChangeTransform: (transform: SceneTransform) => void
  onRename: (name: string) => void
  onGroundSnap: () => void
}

/**
 * The selected node's transform, plus what the server derived about it.
 *
 * The derived block is the part that matters for a scene built by an agent: the
 * asset's real size, where its origin sits, and how far off the ground it is.
 * Those are the numbers that explain why a placement looks wrong, and they are
 * read-only because they describe the asset, not this placement of it.
 */
export function ScenePropertyPanel({
  node,
  facts,
  warnings,
  groundOffset,
  onChangeTransform,
  onRename,
  onGroundSnap,
}: ScenePropertyPanelProps): JSX.Element {
  if (!node) {
    return (
      <div className="scene-properties scene-properties--empty">
        Select a node to edit it.
      </div>
    )
  }

  const update = (key: keyof SceneTransform, value: Vec3) =>
    onChangeTransform({ ...node.transform, [key]: value })

  return (
    <div className="scene-properties" data-testid="scene-properties">
      <label className="scene-properties-field">
        <span>Name</span>
        <input
          type="text"
          value={node.name ?? ''}
          placeholder={node.id}
          onChange={event => onRename(event.target.value)}
        />
      </label>

      <VectorField
        label="Position (m)"
        value={node.transform.position}
        onChange={value => update('position', value)}
      />
      <VectorField
        label="Rotation (°)"
        value={node.transform.rotationEuler}
        onChange={value => update('rotationEuler', value)}
      />
      <VectorField
        label="Scale"
        value={node.transform.scale}
        step={0.01}
        onChange={value => update('scale', value)}
      />

      {facts ? (
        <div className="scene-properties-derived">
          <h4>From the library</h4>
          <dl>
            <dt>Source size</dt>
            <dd>
              {facts.sourceDimensions
                ? `${format(facts.sourceDimensions.x)} × ${format(facts.sourceDimensions.y)} × ${format(facts.sourceDimensions.z)} m`
                : 'not derived'}
            </dd>
            <dt>Origin</dt>
            <dd>{facts.originConvention ?? 'unclassified'}</dd>
            <dt>Off the ground</dt>
            <dd>
              {groundOffset == null ? 'unknown' : `${format(-groundOffset)} m`}
            </dd>
          </dl>

          <button
            type="button"
            className="scene-properties-action"
            onClick={onGroundSnap}
            disabled={groundOffset == null}
            title={
              groundOffset == null
                ? 'Unknown for this node: either the asset has no derived bounds, or it has moved since it was last saved.'
                : 'Rest this node on y = 0 using its origin convention.'
            }
          >
            Rest on ground
          </button>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="scene-properties-warnings">
          {warnings.map(warning => (
            <li key={`${warning.nodeId}-${warning.code}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function VectorField({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string
  value: Vec3
  step?: number
  onChange: (value: Vec3) => void
}): JSX.Element {
  return (
    <div className="scene-properties-field">
      <span>{label}</span>
      <div className="scene-properties-vector">
        {(['x', 'y', 'z'] as const).map(axis => (
          <input
            key={axis}
            type="number"
            step={step}
            aria-label={`${label} ${axis}`}
            value={value[axis]}
            onChange={event => {
              const parsed = Number(event.target.value)
              // A half-typed "-" or "" parses to NaN, and writing that into the
              // document would fail validation on save with an error about a
              // field the user is still editing.
              if (Number.isFinite(parsed)) {
                onChange({ ...value, [axis]: parsed })
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
