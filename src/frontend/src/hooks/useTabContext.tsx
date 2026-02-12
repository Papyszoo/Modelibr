import { useContext, ReactNode } from 'react'
import TabContext, { TabContextValue } from '@/contexts/TabContext'
import { Tab } from '@/types'

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
    // Check if tab already exists
    const existingTab = tabs.find(
      tab => tab.type === 'modelViewer' && tab.modelId === modelId
    )

    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab: Tab = {
      id: `model-${modelId}`,
      type: 'modelViewer',
      label: name || `Model ${modelId}`,
      modelId: modelId,
    }

    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const openTextureSetDetailsTab = (
    textureSetId: number,
    name?: string
  ): void => {
    // Check if tab already exists
    const existingTab = tabs.find(
      tab =>
        tab.type === 'textureSetViewer' && tab.setId === textureSetId.toString()
    )

    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab: Tab = {
      id: `set-${textureSetId}`,
      type: 'textureSetViewer',
      label: name || `Set ${textureSetId}`,
      setId: textureSetId.toString(),
    }

    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const openPackDetailsTab = (packId: string): void => {
    // Check if tab already exists
    const existingTab = tabs.find(
      tab => tab.type === 'packViewer' && tab.packId === packId
    )

    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab: Tab = {
      id: `pack-${packId}`,
      type: 'packViewer',
      label: `Pack ${packId}`,
      packId: packId,
    }

    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const openProjectDetailsTab = (projectId: string): void => {
    // Check if tab already exists
    const existingTab = tabs.find(
      tab => tab.type === 'projectViewer' && tab.projectId === projectId
    )

    if (existingTab) {
      // Switch to existing tab
      setActiveTab(existingTab.id)
      return
    }

    // Create new tab
    const newTab: Tab = {
      id: `project-${projectId}`,
      type: 'projectViewer',
      label: `Project ${projectId}`,
      projectId: projectId,
    }

    const newTabs = [...tabs, newTab]
    setTabs(newTabs)
    setActiveTab(newTab.id)
  }

  const openTab = (
    type: Tab['type'],
    title: string,
    data: unknown = null
  ): void => {
    // Check if tab already exists for certain types
    const existingTab = tabs.find(
      tab =>
        tab.type === type &&
        (type === 'modelList' ||
          type === 'texture' ||
          type === 'textureSets' ||
          type === 'packs' ||
          type === 'sprites' ||
          type === 'stageList' ||
          type === 'animation' ||
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

    // Create new tab
    const newTab: Tab = {
      id:
        type === 'modelViewer' && (data as { id?: string })?.id
          ? `model-${(data as { id?: string }).id}`
          : type === 'textureSetViewer' && (data as { id?: string })?.id
            ? `set-${(data as { id?: string }).id}`
            : type === 'packViewer' && (data as { id?: string })?.id
              ? `pack-${(data as { id?: string }).id}`
              : type === 'projectViewer' && (data as { id?: string })?.id
                ? `project-${(data as { id?: string }).id}`
                : type === 'stageEditor' && (data as { id?: string })?.id
                  ? `stage-${(data as { id?: string }).id}`
                  : type,
      type,
      label: title,
      modelId:
        type === 'modelViewer' ? (data as { id?: string })?.id : undefined,
      setId:
        type === 'textureSetViewer' ? (data as { id?: string })?.id : undefined,
      packId: type === 'packViewer' ? (data as { id?: string })?.id : undefined,
      projectId:
        type === 'projectViewer' ? (data as { id?: string })?.id : undefined,
      stageId:
        type === 'stageEditor' ? (data as { id?: string })?.id : undefined,
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
    openTextureSetDetailsTab,
    openPackDetailsTab,
    openProjectDetailsTab,
    openTab,
  }

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}

export default TabContext
