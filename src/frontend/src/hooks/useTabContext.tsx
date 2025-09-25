import { createContext, useContext, ReactNode } from 'react'
import { Tab } from '../types'
import { Model } from '../utils/fileUtils'

interface TabContextValue {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  openModelDetailsTab: (model: Model) => void
  openTab: (type: Tab['type'], title: string, data?: any) => void
}

const TabContext = createContext<TabContextValue | null>(null)

export const useTabContext = (): TabContextValue => {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider')
  }
  return context
}

interface TabProviderProps {
  children: ReactNode
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
}

export const TabProvider = ({ children, side, tabs, setTabs, activeTab, setActiveTab }: TabProviderProps): JSX.Element => {
  const openModelDetailsTab = (model: Model): void => {
    // Check if tab already exists
    const existingTab = tabs.find(tab => 
      tab.type === 'modelViewer' && tab.modelId === model.id
    )
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab: Tab = {
      id: `model-${model.id}-${Date.now()}`,
      type: 'modelViewer',
      label: model.name || `Model ${model.id}`,
      modelId: model.id
    }
    
    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const openTab = (type: Tab['type'], title: string, data: any = null): void => {
    // Check if tab already exists for certain types
    const existingTab = tabs.find(tab => 
      tab.type === type && (
        type === 'modelList' ||
        type === 'texture' ||
        type === 'animation' ||
        (type === 'modelViewer' && tab.modelId === data?.id)
      )
    )
    
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab: Tab = {
      id: `${type}-${Date.now()}`,
      type,
      label: title,
      modelId: type === 'modelViewer' ? data?.id : undefined
    }
    
    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const value: TabContextValue = {
    side,
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    openModelDetailsTab,
    openTab
  }

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  )
}

export default TabContext