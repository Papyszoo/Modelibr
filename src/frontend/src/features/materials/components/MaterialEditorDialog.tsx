import './MaterialEditorDialog.css'

import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Slider } from 'primereact/slider'
import { type JSX, useState } from 'react'

import { Dialog } from '@/shared/components'

import {
  type AlphaMode,
  type MaterialDto,
  type MaterialParametersDto,
} from '../api/materialApi'
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

export interface MaterialEditorSubmit {
  name: string
  description: string | null
  parameters: MaterialParametersDto
}

interface MaterialEditorDialogProps {
  open: boolean
  /** The material being edited, or null when creating a new one. */
  material: MaterialDto | null
  isSaving: boolean
  onClose: () => void
  onSubmit: (value: MaterialEditorSubmit) => void
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

  // The dialog is remounted per material by its `key` in MaterialList, so the
  // initial state above is the edited material's - no reset effect needed.

  const set = <K extends keyof MaterialParametersDto>(
    key: K,
    value: MaterialParametersDto[K]
  ): void => setParameters(prev => ({ ...prev, [key]: value }))

  const canSave = name.trim().length > 0 && !isSaving

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
            onClick={() =>
              onSubmit({
                name: name.trim(),
                description: description.trim() || null,
                parameters,
              })
            }
          />
        </>
      }
    >
      <div className="material-editor">
        <div className="material-editor-preview">
          <MaterialSwatch parameters={parameters} size="editor" />
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
  onChange: (value: number) => void
}

function ParameterSlider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: ParameterSliderProps): JSX.Element {
  return (
    <div className="material-editor-slider" data-testid={`${id}-row`}>
      <label htmlFor={id}>
        {label}
        <span className="material-editor-slider-value">{value.toFixed(2)}</span>
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
    </div>
  )
}
