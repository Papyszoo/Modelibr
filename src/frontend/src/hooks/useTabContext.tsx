import { useContext, ReactNode } from 'react'
import { TabContext, TabContextValue } from '@/contexts/TabContext'
import { Tab } from '@/types'
import { createTab } from '@/stores/navigationStore'

// eslint-disable-next-line react-refresh/only-export-components
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

export const TabProvider = ({
  children,
  side,
  tabs,
  setTabs,
  activeTab,
  setActiveTab,
}: TabProviderProps): JSX.Element => {
  const openModelDetailsTab = (modelId: string, name?: string): void => {
    const existingTab = tabs.find(
      tab => tab.type === 'modelViewer' && tab.modelId === modelId
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('modelViewer', modelId, name)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const openTextureSetDetailsTab = (
    textureSetId: number,
    name?: string
  ): void => {
    const existingTab = tabs.find(
      tab =>
        tab.type === 'textureSetViewer' && tab.setId === textureSetId.toString()
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('textureSetViewer', textureSetId.toString(), name)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const openPackDetailsTab = (packId: string): void => {
    const existingTab = tabs.find(
      tab => tab.type === 'packViewer' && tab.packId === packId
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('packViewer', packId)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const openProjectDetailsTab = (projectId: string): void => {
    const existingTab = tabs.find(
      tab => tab.type === 'projectViewer' && tab.projectId === projectId
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('projectViewer', projectId)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const openTab = (
    type: Tab['type'],
    title: string,
    data: unknown = null
  ): void => {
    const existingTab = tabs.find(
      tab =>
        tab.type === type &&
        (type === 'modelList' ||
          type === 'textureSets' ||
          type === 'packs' ||
          type === 'sprites' ||
          type === 'stageList' ||
          (type === 'modelViewer' &&
            tab.modelId === (data as { id?: string })?.id) ||
          (type === 'textureSetViewer' &&
            tab.setId === (data as { id?: string })?.id) ||
          (type === 'packViewer' &&
            tab.packId === (data as { id?: string })?.id) ||
          (type === 'stageEditor' &&
            tab.stageId === (data as { id?: string })?.id))
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const id = (data as { id?: string })?.id
    const newTab = createTab(type, id, title)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const value: TabContextValue = {
    side,
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    openModelDetailsTab,
    openTextureSetDetailsTab,
    openPackDetailsTab,
    openProjectDetailsTab,
    openTab,
  }

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}

