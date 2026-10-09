import './MaterialEditorDialog.css'

import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Slider } from 'primereact/slider'
import { type JSX, useMemo, useState } from 'react'

import { ApiClientError } from '@/lib/apiBase'
import { Dialog } from '@/shared/components'
import {
  DRIVER_INPUTS,
  EFFECT_TYPES,
  INPUT_RANGES,
  type MaterialEffect,
  type MaterialEffectDriver,
  type MaterialEffectInputName,
  type MaterialEffectsDocument,
  type MaterialEffectType,
  type MaterialPreviewInputs,
  parseMaterialEffects,
} from '@/shared/three/materialEffects'

import {
  type AlphaMode,
  type MaterialDto,
  type MaterialParametersDto,
} from '../api/materialApi'
import {
  createDefaultEffect,
  defaultDriverScale,
  DRIVER_INPUT_LABELS,
  EFFECT_SPECS,
  type EffectParamSpec,
} from '../lib/materialEffectAuthoring'
import { MaterialSwatch } from './MaterialSwatch'

/**
 * glTF's own defaults - a material with nothing set is a valid material.
 * Kept unexported: a component module that also exports values breaks fast
 * refresh, and nothing outside this dialog needs them yet.
 */
const DEFAULT_PARAMETERS: MaterialParametersDto = {
  baseColorR: 1,
  baseColorG: 1,
  baseColorB: 1,
  baseColorA: 1,
  baseColorHex: '#cccccc',
  roughness: 0.5,
  metallic: 0,
  emissiveR: 0,
  emissiveG: 0,
  emissiveB: 0,
  normalScale: 1,
  occlusionStrength: 1,
  ior: 1.5,
  alphaMode: 'Opaque',
  alphaCutoff: 0.5,
  doubleSided: false,
}

const ALPHA_MODES: { label: string; value: AlphaMode }[] = [
  { label: 'Opaque', value: 'Opaque' },
  { label: 'Mask', value: 'Mask' },
  { label: 'Blend', value: 'Blend' },
]

const DRIVER_OPTIONS = [
  { label: 'None', value: '' },
  ...DRIVER_INPUTS.map(input => ({
    label: DRIVER_INPUT_LABELS[input],
    value: input,
  })),
]

export interface MaterialEditorSubmit {
  name: string
  description: string | null
  parameters: MaterialParametersDto
  /**
   * undefined leaves the stored effects alone, null removes them, and a document
   * replaces them. A new material only ever sees a document or undefined.
   */
  effects?: MaterialEffectsDocument | null
}

interface MaterialEditorDialogProps {
  open: boolean
  /** The material being edited, or null when creating a new one. */
  material: MaterialDto | null
  isSaving: boolean
  onClose: () => void
  onSubmit: (value: MaterialEditorSubmit) => Promise<void>
}

export function MaterialEditorDialog({
  open,
  material,
  isSaving,
  onClose,
  onSubmit,
}: MaterialEditorDialogProps): JSX.Element {
  const [name, setName] = useState(material?.name ?? '')
  const [description, setDescription] = useState(material?.description ?? '')
  const [parameters, setParameters] = useState<MaterialParametersDto>(
    material?.parameters ?? DEFAULT_PARAMETERS
  )

  // The document as stored, the baseline the draft is compared against when
  // deciding whether to send anything at all on save.
  const initialEffects = useMemo(
    () => parseMaterialEffects(material?.effects),
    [material?.effects]
  )
  const [effects, setEffects] = useState<MaterialEffect[]>(
    () => initialEffects?.effects ?? []
  )
  const [previewInputs, setPreviewInputs] = useState<MaterialPreviewInputs>(
    () => ({
      speed: initialEffects?.previewInputs?.speed ?? 0,
      impulse: initialEffects?.previewInputs?.impulse ?? 0,
      charge: initialEffects?.previewInputs?.charge ?? 0,
    })
  )
  const [effectsDirty, setEffectsDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The dialog is remounted per material by its `key` in MaterialList, so the
  // initial state above is the edited material's - no reset effect needed.

  const set = <K extends keyof MaterialParametersDto>(
    key: K,
    value: MaterialParametersDto[K]
  ): void => setParameters(prev => ({ ...prev, [key]: value }))

  const setPreviewInput = (
    key: keyof MaterialPreviewInputs,
    value: number
  ): void => {
    setPreviewInputs(prev => ({ ...prev, [key]: value }))
    setEffectsDirty(true)
  }

  const availableEffectOptions = EFFECT_TYPES.filter(
    type => !effects.some(effect => effect.type === type)
  ).map(type => ({ label: EFFECT_SPECS[type].label, value: type }))

  const addEffect = (type: MaterialEffectType): void => {
    setEffects(prev => [...prev, createDefaultEffect(type)])
    setEffectsDirty(true)
  }

  const removeEffect = (type: MaterialEffectType): void => {
    setEffects(prev => prev.filter(effect => effect.type !== type))
    setEffectsDirty(true)
  }

  const updateEffectField = (
    type: MaterialEffectType,
    key: string,
    value: number | string
  ): void => {
    setEffects(prev =>
      prev.map(effect =>
        effect.type === type
          ? ({ ...effect, [key]: value } as MaterialEffect)
          : effect
      )
    )
    setEffectsDirty(true)
  }

  const updateEffectDriver = (
    type: MaterialEffectType,
    param: string,
    driver: MaterialEffectDriver | null
  ): void => {
    setEffects(prev =>
      prev.map(effect => {
        if (effect.type !== type) return effect
        const drivers = { ...(effect.drivers ?? {}) }
        if (driver) drivers[param] = driver
        else delete drivers[param]
        const next = { ...effect } as MaterialEffect & {
          drivers?: Record<string, MaterialEffectDriver>
        }
        if (Object.keys(drivers).length > 0) next.drivers = drivers
        else delete next.drivers
        return next
      })
    )
    setEffectsDirty(true)
  }

  // The live draft, handed to the animated preview so an edit shows before it is
  // saved. Null (no effects) keeps the CSS swatch.
  const draftEffects = useMemo<MaterialEffectsDocument | null>(
    () => (effects.length > 0 ? { version: 1, effects, previewInputs } : null),
    [effects, previewInputs]
  )
  const previewMaterial = useMemo(
    () => ({
      name: material?.name ?? 'Preview',
      parameters,
      effects: draftEffects,
    }),
    [material?.name, parameters, draftEffects]
  )

  const canSave = name.trim().length > 0 && !isSaving

  const handleSave = async (): Promise<void> => {
    setSaveError(null)
    const hadEffects = (initialEffects?.effects.length ?? 0) > 0
    let effectField: MaterialEffectsDocument | null | undefined
    if (!effectsDirty) {
      // Untouched: say nothing, so the server keeps the stored document.
      effectField = undefined
    } else if (effects.length === 0) {
      // Removed every effect that existed. An empty draft that never had one is
      // simply "no effects", not a request to clear anything.
      effectField = hadEffects ? null : undefined
    } else {
      effectField = { version: 1, effects, previewInputs }
    }

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        parameters,
        effects: effectField,
      })
    } catch (caught) {
      setSaveError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The material could not be saved.'
      )
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      header={material ? `Edit ${material.name}` : 'New PBR material'}
      size="md"
      footer={
        <>
          <Button label="Cancel" text size="small" onClick={onClose} />
          <Button
            label={material ? 'Save' : 'Create'}
            icon="pi pi-check"
            size="small"
            data-testid="material-editor-save"
            disabled={!canSave}
            loading={isSaving}
            onClick={() => void handleSave()}
          />
        </>
      }
    >
      <div className="material-editor">
        <div className="material-editor-preview-pane">
          <div className="material-editor-preview">
            <MaterialSwatch
              parameters={parameters}
              size="editor"
              material={previewMaterial}
            />
          </div>

          {effects.length > 0 && (
            <div
              className="material-editor-preview-inputs"
              data-testid="material-preview-inputs"
            >
              <span className="material-editor-section-title">
                Preview inputs
              </span>
              <ParameterSlider
                id="preview-speed"
                label="Speed"
                value={previewInputs.speed ?? 0}
                min={INPUT_RANGES.speed[0]}
                max={INPUT_RANGES.speed[1]}
                step={0.1}
                onChange={value => setPreviewInput('speed', value)}
              />
              <ParameterSlider
                id="preview-impulse"
                label="Impulse"
                value={previewInputs.impulse ?? 0}
                min={INPUT_RANGES.impulse[0]}
                max={INPUT_RANGES.impulse[1]}
                step={0.01}
                onChange={value => setPreviewInput('impulse', value)}
              />
              <ParameterSlider
                id="preview-charge"
                label="Charge"
                value={previewInputs.charge ?? 0}
                min={INPUT_RANGES.charge[0]}
                max={INPUT_RANGES.charge[1]}
                step={0.01}
                onChange={value => setPreviewInput('charge', value)}
              />
            </div>
          )}
        </div>

        <div className="material-editor-fields">
          <label htmlFor="material-name">Name</label>
          <InputText
            id="material-name"
            value={name}
            autoFocus
            placeholder="Weathered brass"
            data-testid="material-name-input"
            onChange={event => setName(event.target.value)}
          />

          <label htmlFor="material-description">Description</label>
          <InputTextarea
            id="material-description"
            value={description}
            rows={2}
            autoResize
            placeholder="Optional - what this material is for."
            onChange={event => setDescription(event.target.value)}
          />

          <label htmlFor="material-base-color">Base colour</label>
          <div className="material-editor-color-row">
            <input
              id="material-base-color"
              type="color"
              className="material-editor-color"
              value={parameters.baseColorHex}
              data-testid="material-base-color"
              onChange={event => set('baseColorHex', event.target.value)}
            />
            <code className="material-editor-hex">
              {parameters.baseColorHex}
            </code>
          </div>

          <ParameterSlider
            id="material-roughness"
            label="Roughness"
            value={parameters.roughness}
            onChange={value => set('roughness', value)}
          />
          <ParameterSlider
            id="material-metallic"
            label="Metallic"
            value={parameters.metallic}
            onChange={value => set('metallic', value)}
          />
          <ParameterSlider
            id="material-ior"
            label="IOR"
            value={parameters.ior}
            min={1}
            max={2.5}
            step={0.01}
            onChange={value => set('ior', value)}
          />
          <ParameterSlider
            id="material-normal-scale"
            label="Normal scale"
            value={parameters.normalScale}
            max={2}
            onChange={value => set('normalScale', value)}
          />
          <ParameterSlider
            id="material-occlusion"
            label="Occlusion"
            value={parameters.occlusionStrength}
            onChange={value => set('occlusionStrength', value)}
          />

          <label htmlFor="material-alpha-mode">Alpha mode</label>
          <Dropdown
            id="material-alpha-mode"
            value={parameters.alphaMode}
            options={ALPHA_MODES}
            data-testid="material-alpha-mode"
            onChange={event => set('alphaMode', event.value as AlphaMode)}
          />

          {parameters.alphaMode === 'Blend' && (
            <ParameterSlider
              id="material-opacity"
              label="Opacity"
              value={parameters.baseColorA}
              onChange={value => set('baseColorA', value)}
            />
          )}
          {parameters.alphaMode === 'Mask' && (
            <ParameterSlider
              id="material-alpha-cutoff"
              label="Alpha cutoff"
              value={parameters.alphaCutoff}
              onChange={value => set('alphaCutoff', value)}
            />
          )}

          <div className="material-editor-check">
            <Checkbox
              inputId="material-double-sided"
              checked={parameters.doubleSided}
              data-testid="material-double-sided"
              onChange={event => set('doubleSided', event.checked === true)}
            />
            <label htmlFor="material-double-sided">Double sided</label>
          </div>

          <div className="material-editor-effects">
            <span className="material-editor-section-title">Effects</span>

            {availableEffectOptions.length > 0 && (
              <Dropdown
                value={null}
                options={availableEffectOptions}
                placeholder="Add effect"
                data-testid="material-add-effect"
                onChange={event => addEffect(event.value as MaterialEffectType)}
              />
            )}

            {effects.map(effect => (
              <EffectBlock
                key={effect.type}
                effect={effect}
                onFieldChange={(key, value) =>
                  updateEffectField(effect.type, key, value)
                }
                onDriverChange={(param, driver) =>
                  updateEffectDriver(effect.type, param, driver)
                }
                onRemove={() => removeEffect(effect.type)}
              />
            ))}

            {saveError && (
              <p className="material-editor-error" role="alert">
                {saveError}
              </p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

interface ParameterSliderProps {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  /** Seed and other whole-number params read better without decimals. */
  decimals?: number
  /** Optional one-line explanation shown under the slider. */
  hint?: string
  onChange: (value: number) => void
}

function ParameterSlider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  decimals = 2,
  hint,
  onChange,
}: ParameterSliderProps): JSX.Element {
  return (
    <div className="material-editor-slider" data-testid={`${id}-row`}>
      <label htmlFor={id}>
        {label}
        <span className="material-editor-slider-value">
          {value.toFixed(decimals)}
        </span>
      </label>
      <Slider
        // PrimeReact's Slider is not an <input>, so the label's htmlFor has
        // nothing to bind to; the id goes on the wrapper for test targeting.
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(event.value as number)}
      />
      {hint && <span className="material-editor-hint">{hint}</span>}
    </div>
  )
}

interface EffectBlockProps {
  effect: MaterialEffect
  onFieldChange: (key: string, value: number | string) => void
  onDriverChange: (param: string, driver: MaterialEffectDriver | null) => void
  onRemove: () => void
}

function EffectBlock({
  effect,
  onFieldChange,
  onDriverChange,
  onRemove,
}: EffectBlockProps): JSX.Element {
  const spec = EFFECT_SPECS[effect.type]
  const color = spec.color
  // Values are read by key rather than through the discriminated union: the
  // metadata, not the union narrowing, is what knows a param's name here.
  const values = effect as unknown as Record<string, number | string>

  return (
    <div
      className="material-editor-effect"
      data-testid={`material-effect-${effect.type}`}
    >
      <div className="material-editor-effect-header">
        <span className="material-editor-effect-title">{spec.label}</span>
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          aria-label={`Remove ${spec.label}`}
          data-testid={`material-effect-${effect.type}-remove`}
          onClick={onRemove}
        />
      </div>

      {color && (
        <>
          <label htmlFor={`effect-${effect.type}-${color.key}`}>
            {color.label}
          </label>
          <div className="material-editor-color-row">
            <input
              id={`effect-${effect.type}-${color.key}`}
              type="color"
              className="material-editor-color"
              value={String(values[color.key] ?? '#ffffff').toLowerCase()}
              data-testid={`effect-${effect.type}-${color.key}`}
              onChange={event => onFieldChange(color.key, event.target.value)}
            />
            <code className="material-editor-hex">
              {String(values[color.key] ?? '')}
            </code>
          </div>
        </>
      )}

      {spec.params.map(param => (
        <EffectParamRow
          key={param.key}
          effectType={effect.type}
          param={param}
          value={Number(values[param.key] ?? param.min)}
          driver={
            (effect as { drivers?: Record<string, MaterialEffectDriver> })
              .drivers?.[param.key] ?? null
          }
          onValueChange={value => onFieldChange(param.key, value)}
          onDriverChange={driver => onDriverChange(param.key, driver)}
        />
      ))}
    </div>
  )
}

interface EffectParamRowProps {
  effectType: MaterialEffectType
  param: EffectParamSpec
  value: number
  driver: MaterialEffectDriver | null
  onValueChange: (value: number) => void
  onDriverChange: (driver: MaterialEffectDriver | null) => void
}

function EffectParamRow({
  effectType,
  param,
  value,
  driver,
  onValueChange,
  onDriverChange,
}: EffectParamRowProps): JSX.Element {
  const baseId = `effect-${effectType}-${param.key}`

  return (
    <div className="material-editor-effect-param">
      <ParameterSlider
        id={baseId}
        label={param.label}
        value={value}
        min={param.min}
        max={param.max}
        step={param.step}
        decimals={param.integer ? 0 : 2}
        hint={param.hint}
        onChange={onValueChange}
      />

      {param.drivable && (
        <div className="material-editor-driver">
          <label htmlFor={`${baseId}-driver`}>Driven by</label>
          <Dropdown
            inputId={`${baseId}-driver`}
            value={driver?.input ?? ''}
            options={DRIVER_OPTIONS}
            placeholder="None"
            className="material-editor-driver-select"
            data-testid={`${baseId}-driver`}
            onChange={event => {
              const input = event.value as MaterialEffectInputName | ''
              onDriverChange(
                input === ''
                  ? null
                  : {
                      input,
                      scale: defaultDriverScale(param.min, param.max, input),
                    }
              )
            }}
          />
          {driver && (
            <>
              <label htmlFor={`${baseId}-scale`}>x scale</label>
              <input
                // Uncontrolled on purpose: a controlled number input rewrites
                // its text on every keystroke and eats the decimal point. `key`
                // remounts it when the driver's input changes.
                key={driver.input}
                id={`${baseId}-scale`}
                type="number"
                className="material-editor-driver-scale"
                aria-label={`${param.label} driver scale`}
                min={-100}
                max={100}
                step="any"
                defaultValue={driver.scale}
                data-testid={`${baseId}-scale`}
                onChange={event => {
                  const parsed = Number(event.target.value)
                  if (!Number.isFinite(parsed)) return
                  onDriverChange({
                    input: driver.input,
                    scale: Math.max(-100, Math.min(100, parsed)),
                  })
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
