import { createContext } from 'react'

import { type Tab } from '@/types'

export interface TabContextValue {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  openModelDetailsTab: (
    modelId: string,
    name?: string,
    options?: { activate?: boolean }
  ) => void
  openTextureSetDetailsTab: (
    textureSetId: number,
    name?: string,
    options?: { activate?: boolean }
  ) => void
  openEnvironmentMapDetailsTab: (
    environmentMapId: number,
    name?: string
  ) => void
  openPackDetailsTab: (packId: string) => void
  openProjectDetailsTab: (projectId: string) => void
  openScriptDetailsTab: (scriptId: string, name?: string) => void
  openSceneEditorTab: (sceneId: string, name?: string) => void
  openTab: (type: Tab['type'], title: string, data?: unknown) => void
  /**
   * The id of the tab this provider is rendering, and the dock's close action.
   * A tab that is the only way back to its list - a keyed viewer with no list
   * tab of its own - closes itself, and it must go through the dock so the
   * neighbour-selection and the recently-closed list stay in one place.
   */
  tabId: string
  closeTab: (tabId: string) => void
}

export const TabContext = createContext<TabContextValue | null>(null)
