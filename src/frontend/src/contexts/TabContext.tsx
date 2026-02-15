import { createContext } from 'react'
import { Tab } from '@/types'

export interface TabContextValue {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  openModelDetailsTab: (modelId: string, name?: string) => void
  openTextureSetDetailsTab: (textureSetId: number, name?: string) => void
  openPackDetailsTab: (packId: string) => void
  openProjectDetailsTab: (projectId: string) => void
  openTab: (type: Tab['type'], title: string, data?: unknown) => void
}

export const TabContext = createContext<TabContextValue | null>(null)

