import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TabView, TabPanel } from 'primereact/tabview'
import { TextureType } from '@/types'
import {
  useTextureSetByIdQuery,
  getTextureSetByIdQueryOptions,
} from '@/features/texture-set/api/queries'
import { updateTextureSet } from '@/features/texture-set/api/textureSetApi'
import { getNonHeightTypes } from '@/utils/textureTypeUtils'
import SetHeader from '@/features/texture-set/dialogs/SetHeader'
import SetStats from '@/features/texture-set/dialogs/SetStats'
import TextureSetModelList from './TextureSetModelList'
import TextureCard from './TextureCard'
import HeightCard from './HeightCard'
import FilesTab from './FilesTab'
import TexturePreviewPanel from './TexturePreviewPanel'
import CardWidthSlider from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import './TextureSetViewer.css'

interface TextureSetViewerProps {
  setId: string
  side?: 'left' | 'right'
}

function TextureSetViewer({ setId, side = 'left' }: TextureSetViewerProps) {
  const [updating, setUpdating] = useState(false)
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const queryClient = useQueryClient()
  const textureSetId = parseInt(setId)
  const textureSetQuery = useTextureSetByIdQuery({
    textureSetId,
    queryConfig: {
      enabled: !Number.isNaN(textureSetId),
    },
  })
  const textureSet = textureSetQuery.data ?? null
  const loading = textureSetQuery.isLoading
  const error =
    textureSetQuery.error instanceof Error ? textureSetQuery.error.message : ''

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.textureSetViewer

  const refreshTextureSet = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: getTextureSetByIdQueryOptions(textureSetId).queryKey,
    })
    await textureSetQuery.refetch()
  }, [queryClient, textureSetId, textureSetQuery])

  const updateTextureSetMutation = useMutation({
    mutationFn: (newName: string) => {
      if (!textureSet) {
        throw new Error('Texture set not found')
      }
      return updateTextureSet(textureSet.id, { name: newName })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
    },
  })

  const handleUpdateName = async (newName: string) => {
    if (!textureSet) return

    try {
      setUpdating(true)
      await updateTextureSetMutation.mutateAsync(newName)
      await refreshTextureSet()
    } catch (error) {
      console.error('Failed to update texture set:', error)
      throw error
    } finally {
      setUpdating(false)
    }
  }

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

  // Get texture types excluding Height/Displacement/Bump (those are handled by HeightCard)
  const nonHeightTypes = getNonHeightTypes()

  return (
    <div className="texture-set-viewer">
      <header className="set-viewer-header">
        <div className="set-overview">
          <div className="set-info">
            <SetHeader
              textureSet={textureSet}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <SetStats textureSet={textureSet} />
          </div>
        </div>
      </header>

      <TabView
        className="set-viewer-tabs"
        activeIndex={activeTabIndex}
        onTabChange={e => setActiveTabIndex(e.index)}
      >
        <TabPanel header="Texture Types" leftIcon="pi pi-image">
          <div
            style={{
              padding: '1rem',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <CardWidthSlider
              value={cardWidth}
              min={200}
              max={500}
              onChange={width => setCardWidth('textureSetViewer', width)}
            />
          </div>
          <div
            className="texture-cards-grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {/* Regular texture type cards (excluding Height/Displacement/Bump) */}
            {nonHeightTypes.map((textureType: TextureType) => {
              const texture =
                textureSet.textures.find(t => t.textureType === textureType) ||
                null

              return (
                <TextureCard
                  key={textureType}
                  textureType={textureType}
                  texture={texture}
                  setId={textureSet.id}
                  onTextureUpdated={refreshTextureSet}
                />
              )
            })}

            {/* Special HeightCard with mode dropdown for Height/Displacement/Bump */}
            <HeightCard
              textures={textureSet.textures}
              setId={textureSet.id}
              onTextureUpdated={refreshTextureSet}
            />
          </div>
        </TabPanel>

        {/* Files Tab - channel mapping for source files */}
        <TabPanel header="Files" leftIcon="pi pi-file">
          <FilesTab
            textureSet={textureSet}
            onMappingChanged={refreshTextureSet}
          />
        </TabPanel>

        <TabPanel header="Models" leftIcon="pi pi-box">
          <TextureSetModelList textureSetId={textureSet.id} />
        </TabPanel>

        {textureSet.textureCount > 0 && (
          <TabPanel header="Preview" leftIcon="pi pi-eye">
            <TexturePreviewPanel textureSet={textureSet} side={side} />
          </TabPanel>
        )}
      </TabView>
    </div>
  )
}

export default TextureSetViewer
