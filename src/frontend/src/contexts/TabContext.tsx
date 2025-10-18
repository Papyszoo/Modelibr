import { createContext } from 'react'
import { Tab, TextureSetDto } from '../types'
import { Model } from '../utils/fileUtils'

export interface TabContextValue {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  openModelDetailsTab: (model: Model) => void
  openTextureSetDetailsTab: (textureSet: TextureSetDto) => void
  openPackDetailsTab: (packId: string) => void
  openProjectDetailsTab: (projectId: string) => void
  openTab: (type: Tab['type'], title: string, data?: unknown) => void
}

const TabContext = createContext<TabContextValue | null>(null)

export default TabContext
