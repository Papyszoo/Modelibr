import './AssetMetadataPanel.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { type JSX, useEffect, useMemo, useState } from 'react'

import { TagInput } from '@/shared/components/tags/TagInput'

import { setAssetMetadata } from '../api/metadataApi'
import {
  useAssetMetadataQuery,
  useAssetMetadataSchemaQuery,
} from '../api/queries'
import type {
  AssetMetadataField,
  AssetMetadataGroup,
  AssetMetadataResponse,
} from '../types'

/**
 * What an asset says about itself: description, tags, style, theme, licence,
 * author, and where it came from.
 *
 * The schema is the contract and this renders it - the field list, its groups,
 * its enum vocabularies and which fields are writable all come from the server.
 * A panel that hardcoded them would be a second declaration to keep in step,
 * and the whole point of the schema is that all six families share one.
 *
 * Two rules the layout carries:
 *
 * - **A read-only field is shown, not hidden.** `imported` and `derived` values
 *   are how an asset says where it came from, and hiding them would make a
 *   store import look like an asset nobody knows anything about.
 * - **Saving sends a patch of what changed.** An absent key means "leave it";
 *   sending every field would let opening and saving this panel overwrite what
 *   an agent wrote in between.
 */
const GROUP_ORDER: AssetMetadataGroup[] = [
  'identity',
  'classification',
  'descriptive',
  'rights',
  'provenance',
  'technical',
]

const GROUP_LABELS: Record<AssetMetadataGroup, string> = {
  identity: 'Identity',
  classification: 'Classification',
  descriptive: 'Description',
  rights: 'Rights',
  provenance: 'Where it came from',
  technical: 'Technical',
}

interface AssetMetadataPanelProps {
  assetType: string
  assetId: number
  showToast?: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
}

type Draft = Record<string, unknown>

export function AssetMetadataPanel({
  assetType,
  assetId,
  showToast,
}: AssetMetadataPanelProps): JSX.Element {
  const queryClient = useQueryClient()
  const { data: values, isLoading } = useAssetMetadataQuery({
    assetType,
    assetId,
  })
  const { data: schema } = useAssetMetadataSchemaQuery({ assetType })

  // Only what the user changed. Seeded empty and cleared on every reload, so a
  // save is a patch of edits rather than a rewrite of the whole record.
  const [draft, setDraft] = useState<Draft>({})

  useEffect(() => {
    setDraft({})
  }, [values])

  const fields = useMemo(
    () => schema?.families.find(f => f.assetType === assetType)?.fields ?? [],
    [schema, assetType]
  )

  const current = useMemo(() => {
    const map = new Map<string, unknown>()
    for (const value of values?.fields ?? []) {
      map.set(value.key, value.value)
    }
    return map
  }, [values])

  const save = useMutation({
    mutationFn: () => setAssetMetadata(assetType, assetId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['metadata', 'values', assetType, assetId],
      })
      setDraft({})
      showToast?.({
        severity: 'success',
        summary: 'Metadata saved',
        detail: 'Only the fields you changed were sent.',
        life: 3000,
      })
    },
    onError: () =>
      showToast?.({
        severity: 'error',
        summary: 'Could not save',
        detail: 'Nothing was changed.',
        life: 5000,
      }),
  })

  if (isLoading || !values) {
    return <p className="asset-metadata-note">Loading metadata…</p>
  }

  const dirty = Object.keys(draft).length > 0

  return (
    <div className="asset-metadata" data-testid="asset-metadata">
      <div className="asset-metadata-head">
        <Completeness values={values} />
        <div className="asset-metadata-actions">
          <Button
            label="Discard"
            size="small"
            text
            disabled={!dirty || save.isPending}
            onClick={() => setDraft({})}
          />
          <Button
            label={save.isPending ? 'Saving…' : 'Save'}
            icon="pi pi-save"
            size="small"
            disabled={!dirty || save.isPending}
            data-testid="asset-metadata-save"
            onClick={() => save.mutate()}
          />
        </div>
      </div>

      {GROUP_ORDER.map(group => {
        const groupFields = fields.filter(field => field.group === group)
        if (groupFields.length === 0) {
          return null
        }

        return (
          <section className="asset-metadata-group" key={group}>
            <h4>{GROUP_LABELS[group]}</h4>
            {groupFields.map(field => (
              <Field
                key={field.key}
                field={field}
                value={
                  field.key in draft ? draft[field.key] : current.get(field.key)
                }
                onChange={next =>
                  setDraft(currentDraft => ({
                    ...currentDraft,
                    [field.key]: next,
                  }))
                }
              />
            ))}
          </section>
        )
      })}
    </div>
  )
}

/**
 * How much of what a person could fill is filled.
 *
 * Counted over fillable fields only - a bar that counted derived ones would
 * report an asset as complete because the extractor did its job.
 */
function Completeness({
  values,
}: {
  values: AssetMetadataResponse
}): JSX.Element {
  const { filledFieldCount, fillableFieldCount, missingKeys } =
    values.completeness

  return (
    <div className="asset-metadata-completeness">
      <span data-testid="asset-metadata-completeness">
        {filledFieldCount} of {fillableFieldCount} fields filled
      </span>
      {missingKeys.length > 0 ? (
        <span className="asset-metadata-note">
          missing: {missingKeys.join(', ')}
        </span>
      ) : null}
    </div>
  )
}

function Field({
  field,
  value,
  onChange,
}: {
  field: AssetMetadataField
  value: unknown
  onChange: (value: unknown) => void
}): JSX.Element {
  const id = `metadata-${field.key}`

  return (
    <div className="asset-metadata-field">
      <label htmlFor={id}>
        {field.label}
        {field.readOnly ? (
          // Said out loud rather than left to be discovered by clicking: the
          // value is real and worth reading, it just is not the user's to edit.
          <span className="asset-metadata-badge">{field.provenance}</span>
        ) : null}
      </label>

      {field.description ? (
        <p className="asset-metadata-note">{field.description}</p>
      ) : null}

      <Editor field={field} id={id} value={value} onChange={onChange} />
    </div>
  )
}

function Editor({
  field,
  id,
  value,
  onChange,
}: {
  field: AssetMetadataField
  id: string
  value: unknown
  onChange: (value: unknown) => void
}): JSX.Element {
  const disabled = field.readOnly

  if (field.repeats) {
    // Repeating fields are chip lists whether or not they are enums. An enum one
    // is closed - the vocabulary is the contract, and a value outside it is one
    // no search filter will ever match.
    const list = Array.isArray(value) ? (value as string[]) : []

    return (
      <TagInput
        inputTestId={id}
        value={list}
        options={field.allowedValues ?? undefined}
        allowCustom={!field.allowedValues}
        suggestionsLabel={field.label}
        placeholder={disabled ? '' : `Add ${field.label.toLowerCase()}…`}
        onChange={next => onChange(next)}
      />
    )
  }

  switch (field.type) {
    case 'multiline':
      return (
        <InputTextarea
          id={id}
          rows={3}
          autoResize
          disabled={disabled}
          value={(value as string) ?? ''}
          onChange={event => onChange(event.target.value || null)}
        />
      )

    case 'boolean':
      return (
        <Checkbox
          inputId={id}
          disabled={disabled}
          checked={value === true}
          onChange={event => onChange(event.checked ?? false)}
        />
      )

    case 'integer':
    case 'number':
      return (
        <InputNumber
          inputId={id}
          disabled={disabled}
          value={typeof value === 'number' ? value : null}
          maxFractionDigits={field.type === 'integer' ? 0 : 3}
          onValueChange={event => onChange(event.value ?? null)}
        />
      )

    case 'enum':
      return (
        <select
          id={id}
          className="asset-metadata-select"
          disabled={disabled}
          value={(value as string) ?? ''}
          onChange={event => onChange(event.target.value || null)}
        >
          <option value="">—</option>
          {(field.allowedValues ?? []).map(allowed => (
            <option key={allowed} value={allowed}>
              {allowed}
            </option>
          ))}
        </select>
      )

    default:
      return (
        <InputText
          id={id}
          disabled={disabled}
          value={value === null || value === undefined ? '' : String(value)}
          // Empty means cleared, and an empty string is not the same stored
          // value as "no value" - null is what the patch contract clears with.
          onChange={event => onChange(event.target.value || null)}
        />
      )
  }
}
