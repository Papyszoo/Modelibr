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
  /**
   * Which half of a partitioned category tree this asset's `category` may come
   * from - `Universal` or `ModelSpecific` - or null for a family whose tree has
   * no partitions.
   *
   * A fact about the asset rather than the family, which is why it is here and
   * not on the schema: a Material always takes Universal, and a TextureSet takes
   * its own kind's, which differs between two sets in the same family.
   */
  categoryKind?: string | null
}

/**
 * A patch, not a replacement. An absent key means "leave it"; an explicit null
 * clears it. A blanket replace would let a pass that only knows the licence
 * wipe the description someone wrote.
 */
export type AssetMetadataPatch = Record<string, unknown>

/**
 * One asset the import automation classified on its own, waiting for a person to
 * confirm or correct it.
 *
 * `sourceFolder` is the evidence, not decoration: the tags come from it, and a
 * reviewer deciding whether "Characters" belongs on this asset needs to see that
 * it was sitting in a folder of that name.
 */
export interface ImportSuggestionItem {
  modelId: number
  name: string
  thumbnailUrl?: string | null
  thumbnailStatus: string
  categoryId?: number | null
  categoryName?: string | null
  tags: string[]
  sourceFolder?: string | null
  appliedAt: string
}

export interface ImportSuggestionsResponse {
  /** Assets waiting in total, not on this page - the banner's number. */
  total: number
  page: number
  pageSize: number
  items: ImportSuggestionItem[]
}

export interface ReviewImportSuggestionsResult {
  reviewed: number
  categoriesCleared: number
  tagsRemoved: number
  /** Still waiting after this call. A whole-queue action is bounded, so repeat while > 0. */
  remaining: number
}

/** What a `categoryRef` field reads back as: the id the write needs, plus a name to show. */
export interface CategoryRefValue {
  id: number
  name: string | null
}
