import { type JSX, type ReactNode, useContext } from 'react'

import { useDockPanelActions } from '@/components/layout/dock-panel/DockPanelActionsContext'
import { TabContext, type TabContextValue } from '@/contexts/TabContext'
import {
  createTab,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { type Tab } from '@/types'

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
  const { closeTab } = useDockPanelActions()
  const setTabLabel = useNavigationStore(state => state.setTabLabel)

  const openModelDetailsTab = (
    modelId: string,
    name?: string,
    options?: { activate?: boolean }
  ): void => {
    const activate = options?.activate ?? true
    const existingTab = tabs.find(
      tab => tab.type === 'modelViewer' && tab.modelId === modelId
    )

    if (existingTab) {
      if (activate) {
        setActiveTab(existingTab.id)
      }
      return
    }

    const newTab = createTab('modelViewer', modelId, name)
    setTabs([...tabs, newTab])
    if (activate) {
      setActiveTab(newTab.id)
    }
  }

  const openTextureSetDetailsTab = (
    textureSetId: number,
    name?: string,
    options?: { activate?: boolean }
  ): void => {
    const activate = options?.activate ?? true
    const existingTab = tabs.find(
      tab =>
        tab.type === 'textureSetViewer' && tab.setId === textureSetId.toString()
    )

    if (existingTab) {
      if (activate) {
        setActiveTab(existingTab.id)
      }
      return
    }

    const newTab = createTab('textureSetViewer', textureSetId.toString(), name)
    setTabs([...tabs, newTab])
    if (activate) {
      setActiveTab(newTab.id)
    }
  }

  const openEnvironmentMapDetailsTab = (
    environmentMapId: number,
    name?: string
  ): void => {
    const existingTab = tabs.find(
      tab =>
        tab.type === 'environmentMapViewer' &&
        tab.environmentMapId === environmentMapId.toString()
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab(
      'environmentMapViewer',
      environmentMapId.toString(),
      name
    )
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

  const openScriptDetailsTab = (scriptId: string, name?: string): void => {
    const existingTab = tabs.find(
      tab => tab.type === 'scriptViewer' && tab.scriptId === scriptId
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('scriptViewer', scriptId, name)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const openSceneEditorTab = (sceneId: string, name?: string): void => {
    // One tab per scene, so two scenes can stay open side by side. Re-opening a
    // scene that is already open focuses its tab instead of duplicating it -
    // and, crucially, does not restart its draft.
    const existingTab = tabs.find(
      tab => tab.type === 'sceneEditor' && tab.sceneId === sceneId
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('sceneEditor', sceneId, name)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  const openVfxEditorTab = (vfxId: string, name?: string): void => {
    // One tab per effect, like scenes: re-opening focuses it and keeps its draft.
    const existingTab = tabs.find(
      tab => tab.type === 'vfxEditor' && tab.params.vfxId === vfxId
    )

    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }

    const newTab = createTab('vfxEditor', vfxId, name)
    setTabs([...tabs, newTab])
    setActiveTab(newTab.id)
  }

  /**
   * Relabels an existing tab in place.
   *
   * Not a re-open: a scene renamed in the editor must keep the tab the user is
   * looking at, and a rename that recreated it would take the tab's internal UI
   * state - and with it the scene's unsaved draft - down to nothing.
   */
  const relabelTab = (tabId: string, label: string): void => {
    setTabLabel(getWindowId(), tabId, label)
  }

  const openScenesList = (): void => {
    const existing = tabs.find(tab => tab.type === 'scenes')
    if (existing) {
      setActiveTab(existing.id)
      return
    }
    const listTab = createTab('scenes')
    setTabs([...tabs, listTab])
    setActiveTab(listTab.id)
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
          type === 'environmentMaps' ||
          type === 'packs' ||
          type === 'sprites' ||
          type === 'stageList' ||
          type === 'vfxList' ||
          (type === 'modelViewer' &&
            tab.modelId === (data as { id?: string })?.id) ||
          (type === 'textureSetViewer' &&
            tab.setId === (data as { id?: string })?.id) ||
          (type === 'environmentMapViewer' &&
            tab.environmentMapId === (data as { id?: string })?.id) ||
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
    openEnvironmentMapDetailsTab,
    openPackDetailsTab,
    openProjectDetailsTab,
    openScriptDetailsTab,
    openSceneEditorTab,
    openVfxEditorTab,
    openScenesList,
    relabelTab,
    openTab,
    tabId: activeTab,
    closeTab,
  }

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}
