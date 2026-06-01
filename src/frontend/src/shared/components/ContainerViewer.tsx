import './ContainerViewer.css'

import {
  TabPanel,
  type TabPanelHeaderTemplateOptions,
  TabView,
} from 'primereact/tabview'
import { Toast } from 'primereact/toast'
import { Tooltip } from 'primereact/tooltip'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ModelGrid } from '@/features/models/components/ModelGrid'
import { useTabUiState } from '@/hooks/useTabUiState'
import { ContainerEnvironmentMapsTab } from '@/shared/components/container-tabs/ContainerEnvironmentMapsTab'
import { ContainerSoundsTab } from '@/shared/components/container-tabs/ContainerSoundsTab'
import { ContainerSpritesTab } from '@/shared/components/container-tabs/ContainerSpritesTab'
import { ContainerTextureSetsTab } from '@/shared/components/container-tabs/ContainerTextureSetsTab'
import { useContainerData } from '@/shared/hooks/useContainerData'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { TextureSetKind } from '@/types'

interface ContainerViewerProps {
  adapter: ContainerAdapter
  tabId?: string
}

const renderTabHeader =
  (icon: string, title: string, count?: number) =>
  (options: TabPanelHeaderTemplateOptions) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return (
      <a
        href="#"
        role="tab"
        aria-label={count !== undefined ? `${title} (${count})` : title}
        className={`${options.className} container-tab-trigger`}
        onClick={e => {
          e.preventDefault()
          options.onClick(e)
        }}
        data-pr-tooltip={title}
        data-pr-position="bottom"
        data-testid={`container-tab-${slug}`}
      >
        <i className={`pi ${icon}`} aria-hidden="true" />
        {count !== undefined && (
          <span className="container-tab-count">{count}</span>
        )}
      </a>
    )
  }

export function ContainerViewer({ adapter, tabId }: ContainerViewerProps) {
  const toast = useRef<Toast>(null)
  const [modelTotalCount, setModelTotalCount] = useState(0)
  const [globalMaterialTotalCount, setGlobalMaterialTotalCount] = useState(0)
  const [multiModelTextureTotalCount, setMultiModelTextureTotalCount] =
    useState(0)
  const [spriteTotalCount, setSpriteTotalCount] = useState(0)
  const [soundTotalCount, setSoundTotalCount] = useState(0)
  const [environmentMapTotalCount, setEnvironmentMapTotalCount] = useState(0)

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
  const scopeKey = tabId ?? `${adapter.type}-${adapter.containerId}`

  // Sync tab counts from container data
  useEffect(() => {
    if (container) {
      setModelTotalCount(container.modelCount)
      setGlobalMaterialTotalCount(container.globalMaterialCount)
      setMultiModelTextureTotalCount(container.multiModelTextureCount)
      setSpriteTotalCount(container.spriteCount)
      setSoundTotalCount(container.soundCount)
      setEnvironmentMapTotalCount(container.environmentMapCount ?? 0)
    }
  }, [container])

  if (!container) {
    return <div>Loading...</div>
  }

  return (
    <div className="container-viewer">
      <Toast ref={toast} />

      <Tooltip
        target={`[data-tab-scope="${scopeKey}"] .container-tab-trigger`}
        showDelay={0}
        hideDelay={0}
        mouseTrack={false}
      />

      <div className="container-tab-bar" data-tab-scope={scopeKey}>
        <h2 className="container-title">
          {label}: {container.name}
        </h2>
        <TabView
          activeIndex={activeTabIndex}
          onTabChange={e => setActiveTabIndex(e.index)}
          className="container-tabs container-tabs-compact"
        >
          <TabPanel
            header="Details"
            headerTemplate={renderTabHeader('pi-info-circle', 'Details')}
          >
            {adapter.renderDetails ? (
              adapter.renderDetails({
                container,
                refetchContainer,
                showToast,
              })
            ) : (
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
                    <span>
                      {container.globalMaterialCount} global materials
                    </span>
                    <span>
                      {container.multiModelTextureCount} multi-model textures
                    </span>
                    <span>{container.spriteCount} sprites</span>
                    <span>{container.soundCount} sounds</span>
                    <span>
                      {container.environmentMapCount ?? 0} environment maps
                    </span>
                  </div>
                </div>
              </div>
            )}
          </TabPanel>

          <TabPanel
            header="Models"
            headerTemplate={renderTabHeader(
              'pi-box',
              'Models',
              modelTotalCount
            )}
          >
            <ModelGrid
              {...(adapter.type === 'pack'
                ? { packId: adapter.containerId }
                : { projectId: adapter.containerId })}
              onTotalCountChange={setModelTotalCount}
            />
          </TabPanel>

          <TabPanel
            header="Global Materials"
            headerTemplate={renderTabHeader(
              'pi-globe',
              'Global Materials',
              globalMaterialTotalCount
            )}
          >
            <ContainerTextureSetsTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setGlobalMaterialTotalCount}
              kind={TextureSetKind.Universal}
              assetLabel="global material"
              assetTitle="Global Material"
            />
          </TabPanel>

          <TabPanel
            header="Multi-Model Textures"
            headerTemplate={renderTabHeader(
              'pi-clone',
              'Multi-Model Textures',
              multiModelTextureTotalCount
            )}
          >
            <ContainerTextureSetsTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setMultiModelTextureTotalCount}
              kind={TextureSetKind.ModelSpecific}
              assetLabel="multi-model texture"
              assetTitle="Multi-Model Texture"
            />
          </TabPanel>

          <TabPanel
            header="Sprites"
            headerTemplate={renderTabHeader(
              'pi-image',
              'Sprites',
              spriteTotalCount
            )}
          >
            <ContainerSpritesTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setSpriteTotalCount}
            />
          </TabPanel>

          <TabPanel
            header="Sounds"
            headerTemplate={renderTabHeader(
              'pi-volume-up',
              'Sounds',
              soundTotalCount
            )}
          >
            <ContainerSoundsTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setSoundTotalCount}
            />
          </TabPanel>

          <TabPanel
            header="Environment Maps"
            headerTemplate={renderTabHeader(
              'pi-map',
              'Environment Maps',
              environmentMapTotalCount
            )}
          >
            <ContainerEnvironmentMapsTab
              adapter={adapter}
              showToast={showToast}
              refetchContainer={refetchContainer}
              onTotalCountChange={setEnvironmentMapTotalCount}
            />
          </TabPanel>
        </TabView>
      </div>
    </div>
  )
}
