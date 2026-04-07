export interface ModelGridProps {
  /** When set, filters models by this project and disables the project filter dropdown */
  projectId?: number
  /** When set, filters models by this pack and disables the pack filter dropdown */
  packId?: number
  /** When set, filters models by this texture set */
  textureSetId?: number
  /** Optional scope key for remembering top-level models list state */
  viewStateScope?: string
  /** Called when the total model count changes (e.g. after fetch) */
  onTotalCountChange?: (count: number) => void
}
