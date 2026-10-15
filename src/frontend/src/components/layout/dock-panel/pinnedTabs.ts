import { type TabType } from '@/types'

/**
 * Every main page that can be pinned to the top of the main dock, in the order
 * the dock shows them. An open one shows as its tab; a closed one as an entry
 * that opens it. Materials pins Global Materials; PBR Materials and Multi-Model
 * Textures stay in the New Tab page.
 *
 * This is only the catalogue: which of these are actually pinned is a user
 * preference persisted in `uiPreferencesStore`, and its default (Models and
 * Projects) lives there. Consumers render the pinned subset in this order.
 */
export const PINNED_TAB_TYPES: readonly TabType[] = [
  'modelList',
  'globalMaterials',
  'vfxList',
  'scenes',
  'projects',
]
