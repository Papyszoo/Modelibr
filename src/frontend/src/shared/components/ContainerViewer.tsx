import './ContainerViewer.css'

import { TabPanel, TabView } from 'primereact/tabview'
import { Toast } from 'primereact/toast'
import { useCallback, useRef, useState } from 'react'

import { ModelGrid } from '@/features/models/components/ModelGrid'
import { useTabUiState } from '@/hooks/useTabUiState'
import { ContainerSoundsTab } from '@/shared/components/container-tabs/ContainerSoundsTab'
import { ContainerSpritesTab } from '@/shared/components/container-tabs/ContainerSpritesTab'
import { ContainerTextureSetsTab } from '@/shared/components/container-tabs/ContainerTextureSetsTab'
import { useContainerData } from '@/shared/hooks/useContainerData'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'

interface ContainerViewerProps {
  adapter: ContainerAdapter
  tabId?: string
}

export function ContainerViewer({ adapter, tabId }: ContainerViewerProps) {
  const toast = useRef<Toast>(null)
  const [modelTotalCount, setModelTotalCount] = useState(0)
  const [textureSetTotalCount, setTextureSetTotalCount] = useState(0)
  const [spriteTotalCount, setSpriteTotalCount] = useState(0)
  const [soundTotalCount, setSoundTotalCount] = useState(0)

  const showToast = useCallback(
    (opts: {
      severity: string
      summary: string
      detail: string
      life: number
    }) => {
      toast.current?.show(opts as Parameters<Toast['show']>[0])
    },
    []
  )

  const [activeTabIndex, setActiveTabIndex] = useTabUiState<number>(
    tabId ?? `${adapter.type}-${adapter.containerId}`,
    'activeTabIndex',
    0
  )

  const { container, refetchContainer } = useContainerData(adapter, showToast)
  const label = adapter.label

  if (!container) {
    return <div>Loading...</div>
  }

  return (
    <div className="container-viewer">
      <Toast ref={toast} />

      <div className="container-header">
        <h2>
          {label}: {container.name}
        </h2>
      </div>

      <div className="container-content">
        <TabView
          activeIndex={activeTabIndex}
          onTabChange={e => setActiveTabIndex(e.index)}
          className="container-tabs"
        >
          <TabPanel header="Details">
            <div className="container-details">
              {container.description && (
                <div className="container-detail-row">
                  <label>Description</label>
                  <p>{container.description}</p>
                </div>
              )}
              <div className="container-detail-row">
                <label>Created</label>
                <p>{new Date(container.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="container-detail-row">
                <label>Updated</label>
                <p>{new Date(container.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="container-detail-row">
                <label>Assets</label>
                <div className="container-detail-assets">
                  <span>{container.modelCount} models</span>
                  <span>{container.textureSetCount} texture sets</span>
                  <span>{container.spriteCount} sprites</span>
                  <span>{container.soundCount} sounds</span>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel header={`Models: ${modelTotalCount}`}>
            <ModelGrid
              {...(adapter.type === 'pack'
                ? { packId: adapter.containerId }
                : { projectId: adapter.containerId })}
              onTotalCountChange={setModelTotalCount}
            />
          </TabPanel>

          <TabPanel header={`Texture Sets: ${textureSetTotalCount}`}>
            <ContainerTextureSetsTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setTextureSetTotalCount}
            />
          </TabPanel>

          <TabPanel header={`Sprites: ${spriteTotalCount}`}>
            <ContainerSpritesTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setSpriteTotalCount}
            />
          </TabPanel>

          <TabPanel header={`Sounds: ${soundTotalCount}`}>
            <ContainerSoundsTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setSoundTotalCount}
            />
          </TabPanel>
        </TabView>
      </div>
    </div>
  )
}
