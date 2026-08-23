/**
 * The asset metadata schema (v0.6 prompt 16), as the browser sees it.
 *
 * Mirrors `Application/Metadata` deliberately closely: the schema is the
 * contract, and a UI that re-described the fields in its own words would be a
 * second declaration to keep in step with the first.
 */

/** Where a field belongs on the page. */
export type AssetMetadataGroup =
  | 'identity'
  | 'classification'
  | 'descriptive'
  | 'rights'
  | 'provenance'
  | 'technical'

/** How a field is edited. */
export type AssetMetadataFieldType =
  | 'text'
  | 'multiline'
  | 'enum'
  | 'url'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'date'
  | 'categoryRef'

/** Who put the value there - and so whether a person may change it. */
export type AssetMetadataProvenance = 'authored' | 'derived' | 'imported'

export interface AssetMetadataField {
  key: string
  label: string
  group: AssetMetadataGroup
  type: AssetMetadataFieldType
  provenance: AssetMetadataProvenance
  /** Where the value lives: `entity`, `metadata`, `facets` or `derived`. */
  storage: string
  repeats: boolean
  /** True when the write surface refuses it. Shown, never editable. */
  readOnly: boolean
  description?: string | null
  /** The value set for an enum field; null for everything else. */
  allowedValues?: string[] | null
  categoryFamily?: string | null
  /** The store manifest path that fills this field, when one does. */
  storeManifestPath?: string | null
}

export interface AssetMetadataFamilySchema {
  assetType: string
  fields: AssetMetadataField[]
}

export interface AssetMetadataSchemaResponse {
  version: number
  families: AssetMetadataFamilySchema[]
}

/** One field's current value. Repeating fields arrive as arrays. */
export interface AssetMetadataValue {
  key: string
  group: AssetMetadataGroup
  type: AssetMetadataFieldType
  repeats: boolean
  readOnly: boolean
  provenance: AssetMetadataProvenance
  storage: string
  value: unknown
}

/**
 * What is still missing, over the fields someone could actually fill.
 * Read-only and derived fields are excluded - "incomplete" has to mean
 * "somebody can do something about it".
 */
export interface AssetMetadataCompleteness {
  fillableFieldCount: number
  filledFieldCount: number
  missingKeys: string[]
}

export interface AssetMetadataResponse {
  assetType: string
  assetId: number
  name: string
  schemaVersion: number
  currentSchemaVersion: number
  fields: AssetMetadataValue[]
  completeness: AssetMetadataCompleteness
}

/**
 * A patch, not a replacement. An absent key means "leave it"; an explicit null
 * clears it. A blanket replace would let a pass that only knows the licence
 * wipe the description someone wrote.
 */
export type AssetMetadataPatch = Record<string, unknown>
