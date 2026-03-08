import './TextureSetViewer.css'

import { TabPanel, TabView } from 'primereact/tabview'
import { Toast } from 'primereact/toast'
import { useRef, useState } from 'react'

import { useTextureSetViewerData } from '@/features/texture-set/hooks/useTextureSetViewerData'
import { useTextureSetViewerMutations } from '@/features/texture-set/hooks/useTextureSetViewerMutations'
import { TextureSetKind } from '@/types'

import { FilesTab } from './FilesTab'
import { TexturePreviewPanel } from './TexturePreviewPanel'
import { TextureSetModelList } from './TextureSetModelList'
import { TextureSetViewerHeader } from './TextureSetViewerHeader'
import { TextureTypesTab } from './TextureTypesTab'

interface TextureSetViewerProps {
  setId: string
  side?: 'left' | 'right'
}

export function TextureSetViewer({
  setId,
  side = 'left',
}: TextureSetViewerProps) {
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [textureQuality, setTextureQuality] = useState(0)
  const toast = useRef<Toast>(null)
  const textureSetId = parseInt(setId)

  const {
    textureSet,
    loading,
    error,
    refreshTextureSet,
    availableSizes,
    qualityOptions,
  } = useTextureSetViewerData(textureSetId)

  const { handleUpdateName, updating, generateProxy, isGeneratingProxy } =
    useTextureSetViewerMutations({
      textureSet,
      refreshTextureSet,
      showToast: opts => toast.current?.show(opts),
    })

  if (loading) {
    return (
      <div className="texture-set-viewer-loading">Loading texture set...</div>
    )
  }

  if (error) {
    return <div className="texture-set-viewer-error">Error: {error}</div>
  }

  if (!textureSet) {
    return <div className="texture-set-viewer-error">Texture set not found</div>
  }

  return (
    <div className="texture-set-viewer">
      <Toast ref={toast} />
      <TextureSetViewerHeader
        textureSet={textureSet}
        onNameUpdate={handleUpdateName}
        updating={updating}
        textureQuality={textureQuality}
        onQualityChange={setTextureQuality}
        qualityOptions={qualityOptions}
        availableSizes={availableSizes}
        onGenerateProxy={generateProxy}
        isGeneratingProxy={isGeneratingProxy}
      />

      <TabView
        className="set-viewer-tabs"
        activeIndex={activeTabIndex}
        onTabChange={e => setActiveTabIndex(e.index)}
      >
        <TabPanel header="Texture Types" leftIcon="pi pi-image">
          <TextureTypesTab
            textureSet={textureSet}
            onTextureUpdated={refreshTextureSet}
            side={side}
          />
        </TabPanel>

        <TabPanel header="Files" leftIcon="pi pi-file">
          <FilesTab
            textureSet={textureSet}
            onMappingChanged={refreshTextureSet}
          />
        </TabPanel>

        {textureSet.kind !== TextureSetKind.Universal && (
          <TabPanel header="Models" leftIcon="pi pi-box">
            <TextureSetModelList textureSetId={textureSet.id} />
          </TabPanel>
        )}

        {textureSet.kind === TextureSetKind.Universal &&
          textureSet.textureCount > 0 && (
            <TabPanel header="Preview" leftIcon="pi pi-eye">
              <TexturePreviewPanel
                textureSet={textureSet}
                side={side}
                textureQuality={textureQuality}
              />
            </TabPanel>
          )}
      </TabView>
    </div>
  )
}
