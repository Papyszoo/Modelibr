import './ScenePropertyPanel.css'

import { Button } from 'primereact/button'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { Message } from 'primereact/message'
import { type JSX } from 'react'

import { EmptyState } from '@/shared/components'

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
      <div className="scene-properties">
        <EmptyState
          variant="compact"
          icon="pi-sliders-h"
          title="Nothing selected"
          message="Pick a node in the scene list or click it in the viewport."
        />
      </div>
    )
  }

  const update = (key: keyof SceneTransform, value: Vec3) =>
    onChangeTransform({ ...node.transform, [key]: value })

  return (
    <div className="scene-properties" data-testid="scene-properties">
      <header className="scene-properties-header">
        <h3>{node.name ?? node.id}</h3>
        <span className="scene-properties-id">{node.id}</span>
      </header>

      <div className="scene-properties-body">
        <label className="scene-properties-field">
          <span>Name</span>
          <InputText
            value={node.name ?? ''}
            placeholder={node.id}
            onChange={event => onRename(event.target.value)}
          />
        </label>

        <VectorField
          label="Position"
          unit="m"
          value={node.transform.position}
          step={0.1}
          onChange={value => update('position', value)}
        />
        <VectorField
          label="Rotation"
          unit="°"
          value={node.transform.rotationEuler}
          step={5}
          onChange={value => update('rotationEuler', value)}
        />
        <VectorField
          label="Scale"
          value={node.transform.scale}
          step={0.05}
          onChange={value => update('scale', value)}
        />

        {facts ? (
          <section className="scene-properties-derived">
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
                {groundOffset == null
                  ? 'unknown'
                  : `${format(-groundOffset)} m`}
              </dd>
            </dl>

            <Button
              label="Rest on ground"
              icon="pi pi-arrow-down"
              size="small"
              outlined
              className="scene-properties-action"
              onClick={onGroundSnap}
              disabled={groundOffset == null}
              tooltip={
                groundOffset == null
                  ? 'Unknown for this node: either the asset has no derived bounds, or it has moved since it was last saved.'
                  : 'Rest this node on y = 0 using its origin convention.'
              }
            />
          </section>
        ) : null}

        {warnings.map(warning => (
          <Message
            key={`${warning.nodeId}-${warning.code}`}
            severity="warn"
            text={warning.message}
            className="scene-properties-warning"
          />
        ))}
      </div>
    </div>
  )
}

function VectorField({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string
  unit?: string
  value: Vec3
  step: number
  onChange: (value: Vec3) => void
}): JSX.Element {
  return (
    <div className="scene-properties-field">
      <span>
        {label}
        {unit ? <em> ({unit})</em> : null}
      </span>
      <div className="scene-properties-vector">
        {(['x', 'y', 'z'] as const).map(axis => (
          <span className="scene-properties-axis" key={axis}>
            <label htmlFor={`${label}-${axis}`}>{axis}</label>
            <InputNumber
              inputId={`${label}-${axis}`}
              value={value[axis]}
              step={step}
              minFractionDigits={0}
              maxFractionDigits={3}
              size={5}
              onValueChange={event => {
                // InputNumber reports null while the field is being cleared;
                // writing that into the document would fail validation on save
                // with an error about a field the user is still editing.
                if (typeof event.value === 'number') {
                  onChange({ ...value, [axis]: event.value })
                }
              }}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
