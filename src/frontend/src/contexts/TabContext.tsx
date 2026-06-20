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
  openTab: (type: Tab['type'], title: string, data?: unknown) => void
}

export const TabContext = createContext<TabContextValue | null>(null)
