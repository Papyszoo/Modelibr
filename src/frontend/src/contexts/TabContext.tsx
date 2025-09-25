import { createContext } from 'react'
import { Tab } from '../types'
import { Model } from '../utils/fileUtils'

export interface TabContextValue {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  openModelDetailsTab: (model: Model) => void
  openTab: (type: Tab['type'], title: string, data?: unknown) => void
}

const TabContext = createContext<TabContextValue | null>(null)

export default TabContext
