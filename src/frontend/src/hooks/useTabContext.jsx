import { createContext, useContext } from 'react'

const TabContext = createContext(null)

export const useTabContext = () => {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider')
  }
  return context
}

export const TabProvider = ({ children, side, tabs, setTabs, activeTab, setActiveTab }) => {
  const openModelDetailsTab = (model) => {
    // Check if tab already exists
    const existingTab = tabs.find(tab => 
      tab.type === 'modelDetails' && tab.data?.id === model.id
    )
    
    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab = {
      id: `model-${model.id}-${Date.now()}`,
      type: 'modelDetails',
      title: `Model ${model.id}`,
      data: model
    }
    
    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const openTab = (type, title, data = null) => {
    // Check if tab already exists for certain types
    const existingTab = tabs.find(tab => 
      tab.type === type && (
        type === 'modelList' ||
        type === 'textureList' ||
        type === 'animationList' ||
        (type === 'modelDetails' && tab.data?.id === data?.id)
      )
    )
    
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab = {
      id: `${type}-${Date.now()}`,
      type,
      title,
      data
    }
    
    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const value = {
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