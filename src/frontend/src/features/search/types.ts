export type SearchResultType =
  | 'model'
  | 'textureSet'
  | 'environmentMap'
  | 'sprite'
  | 'sound'
  | 'script'
  | 'pack'
  | 'project'

export interface SearchResultItem {
  type: SearchResultType
  id: number
  name: string
  /** Why this row matched — 'name' or 'tag'. */
  matchedOn: string
}

export interface SearchResultGroup {
  type: SearchResultType
  totalCount: number
  items: SearchResultItem[]
}

export interface GlobalSearchResponse {
  groups: SearchResultGroup[]
}
