import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TabView, TabPanel } from 'primereact/tabview'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { TextureType, TextureSetKind } from '@/types'
import {
  useTextureSetByIdQuery,
  getTextureSetByIdQueryOptions,
} from '@/features/texture-set/api/queries'
import {
  updateTextureSet,
  regenerateTextureSetThumbnail,
} from '@/features/texture-set/api/textureSetApi'
import { getNonHeightTypes } from '@/utils/textureTypeUtils'
import { getFileUrl } from '@/features/models/api/modelApi'
import { SetHeader } from '@/features/texture-set/dialogs/SetHeader'
import { SetStats } from '@/features/texture-set/dialogs/SetStats'
import { TextureSetModelList } from './TextureSetModelList'
import { TextureCard } from './TextureCard'
import { HeightCard } from './HeightCard'
import { FilesTab } from './FilesTab'
import { TexturePreviewPanel } from './TexturePreviewPanel'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import './TextureSetViewer.css'

/** All proxy sizes that can be generated */
const ALL_PROXY_SIZES = [256, 512, 1024, 2048] as const

interface TextureSetViewerProps {
  setId: string
  side?: 'left' | 'right'
}

export function TextureSetViewer({
  setId,
  side = 'left',
}: TextureSetViewerProps) {
  const [updating, setUpdating] = useState(false)
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [textureQuality, setTextureQuality] = useState(0)
  const [originalResolution, setOriginalResolution] = useState<number | null>(null)
  const queryClient = useQueryClient()
  const toast = useRef<Toast>(null)
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
  const cardWidthKey = side === 'right' ? 'textureSetViewerRight' : 'textureSetViewerLeft'
  const cardWidth = settings[cardWidthKey]

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

  // Generate proxies at a specific size
  const generateProxyMutation = useMutation({
    mutationFn: (proxySize: number) =>
      regenerateTextureSetThumbnail(textureSet!.id, { proxySize }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
      toast.current?.show({
        severity: 'success',
        summary: 'Generating',
        detail: 'Proxy generation queued',
        life: 3000,
      })
    },
  })

  // Detect original texture resolution by probing the first non-SplitChannel texture
  useEffect(() => {
    if (!textureSet?.textures?.length) return
    const firstTex = textureSet.textures.find(
      t => t.textureType !== TextureType.SplitChannel
    )
    if (!firstTex) return

    const img = new Image()
    img.onload = () => {
      setOriginalResolution(Math.max(img.naturalWidth, img.naturalHeight))
    }
    img.src = getFileUrl(firstTex.fileId.toString())
    return () => {
      img.onload = null
    }
  }, [textureSet])

  // Gather available proxy sizes across all textures in the set
  const availableSizes = useMemo(() => {
    if (!textureSet) return new Set<number>()
    const sizes = new Set<number>()
    for (const tex of textureSet.textures) {
      if (tex.textureType === TextureType.SplitChannel) continue
      for (const proxy of tex.proxies ?? []) {
        sizes.add(proxy.size)
      }
    }
    return sizes
  }, [textureSet])

  // Build quality dropdown options — show actual resolution, filter duplicates
  const qualityOptions = useMemo(() => {
    const origLabel = originalResolution
      ? `${originalResolution} px`
      : 'Full Resolution'
    const options: { label: string; value: number; available?: boolean }[] = [
      { label: origLabel, value: 0, available: true },
    ]
    for (const size of ALL_PROXY_SIZES) {
      // Don't duplicate: skip if proxy size equals the original resolution
      if (originalResolution && size === originalResolution) continue
      // Skip proxy sizes larger than original (if known)
      if (originalResolution && size >= originalResolution) continue
      options.push({
        label: `${size} px`,
        value: size,
        available: availableSizes.has(size),
      })
    }
    return options
  }, [availableSizes, originalResolution])

  // Custom item template for quality dropdown — unavailable sizes get a Generate button
  const qualityItemTemplate = (option: { label: string; value: number; available?: boolean }) => {
    const isAvailable = option.value === 0 || option.available
    if (isAvailable) {
      return <span>{option.label}</span>
    }
    return (
      <div className="quality-option-unavailable">
        <span className="quality-option-label-na">{option.label} (N/A)</span>
        <Button
          icon="pi pi-download"
          className="p-button-text p-button-sm quality-generate-btn"
          tooltip={`Generate ${option.value}px proxies`}
          tooltipOptions={{ position: 'left' }}
          loading={generateProxyMutation.isPending}
          onClick={(e) => {
            e.stopPropagation()
            generateProxyMutation.mutate(option.value)
          }}
        />
      </div>
    )
  }

  // Handle quality dropdown change — only allow selecting available sizes
  const handleQualityChange = useCallback((value: number) => {
    if (value === 0 || availableSizes.has(value)) {
      setTextureQuality(value)
    }
    // Clicking unavailable size does nothing (Generate button handles it)
  }, [availableSizes])

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
      <Toast ref={toast} />
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
          {textureSet.kind === TextureSetKind.Universal && (
            <div className="set-viewer-quality">
              <label className="quality-label">Texture Quality</label>
              <Dropdown
                value={textureQuality}
                options={qualityOptions}
                onChange={e => handleQualityChange(e.value)}
                itemTemplate={qualityItemTemplate}
                className="quality-dropdown-header"
              />
            </div>
          )}
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
              onChange={width => setCardWidth(cardWidthKey, width)}
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

        {textureSet.kind !== TextureSetKind.Universal && (
          <TabPanel header="Models" leftIcon="pi pi-box">
            <TextureSetModelList textureSetId={textureSet.id} />
          </TabPanel>
        )}

        {textureSet.kind === TextureSetKind.Universal &&
          textureSet.textureCount > 0 && (
            <TabPanel header="Preview" leftIcon="pi pi-eye">
              <TexturePreviewPanel textureSet={textureSet} side={side} textureQuality={textureQuality} />
            </TabPanel>
          )}
      </TabView>
    </div>
  )
}
