import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import { TabView, TabPanel } from 'primereact/tabview'
import { TextureSetDto, TextureType, SpriteDto, SoundDto } from '@/types'
import { ContainerAdapter, ContainerDto } from '@/shared/types/ContainerTypes'
import { ModelGrid } from '@/features/models/components/ModelGrid'
import { UploadableGrid } from '@/shared/components'
import { useTabContext } from '@/hooks/useTabContext'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import {
  getAllTextureSets,
  getTextureSetsPaginated,
} from '@/features/texture-set/api/textureSetApi'
import {
  createSpriteWithFile,
  getAllSprites,
  getSpritesPaginated,
} from '@/features/sprite/api/spriteApi'
import {
  createSoundWithFile,
  getAllSounds,
  getSoundsPaginated,
} from '@/features/sounds/api/soundApi'
import { getFileUrl } from '@/features/models/api/modelApi'
import {
  formatDuration,
  filterAudioFiles,
  processAudioFile,
} from '@/utils/audioUtils'
import './ContainerViewer.css'

interface ContainerViewerProps {
  adapter: ContainerAdapter
}

export function ContainerViewer({ adapter }: ContainerViewerProps) {
  const [container, setContainer] = useState<ContainerDto | null>(null)
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [sprites, setSprites] = useState<SpriteDto[]>([])
  const [sounds, setSounds] = useState<SoundDto[]>([])
  const [allTextureSets, setAllTextureSets] = useState<TextureSetDto[]>([])
  const [allSprites, setAllSprites] = useState<SpriteDto[]>([])
  const [allSounds, setAllSounds] = useState<SoundDto[]>([])
  const [modelTotalCount, setModelTotalCount] = useState(0)
  const [, setLoading] = useState(true)
  const [showAddTextureSetDialog, setShowAddTextureSetDialog] = useState(false)
  const [showAddSpriteDialog, setShowAddSpriteDialog] = useState(false)
  const [showAddSoundDialog, setShowAddSoundDialog] = useState(false)
  const [showSpriteModal, setShowSpriteModal] = useState(false)
  const [showSoundModal, setShowSoundModal] = useState(false)
  const [textureSetSearchQuery, setTextureSetSearchQuery] = useState('')
  const [spriteSearchQuery, setSpriteSearchQuery] = useState('')
  const [soundSearchQuery, setSoundSearchQuery] = useState('')
  const [selectedTextureSetIds, setSelectedTextureSetIds] = useState<number[]>(
    []
  )
  const [selectedSpriteIds, setSelectedSpriteIds] = useState<number[]>([])
  const [selectedSoundIds, setSelectedSoundIds] = useState<number[]>([])
  const [uploadingTextureSet, setUploadingTextureSet] = useState(false)
  const [uploadingSprite, setUploadingSprite] = useState(false)
  const [uploadingSound, setUploadingSound] = useState(false)
  const toast = useRef<Toast>(null)
  const textureSetContextMenu = useRef<ContextMenu>(null)
  const spriteContextMenu = useRef<ContextMenu>(null)
  const soundContextMenu = useRef<ContextMenu>(null)
  const [selectedTextureSet, setSelectedTextureSet] =
    useState<TextureSetDto | null>(null)
  const [selectedSprite, setSelectedSprite] = useState<SpriteDto | null>(null)
  const [selectedSound, setSelectedSound] = useState<SoundDto | null>(null)
  const { openTextureSetDetailsTab } = useTabContext()
  const uploadProgressContext = useUploadProgress()

  // Pagination
  const PAGE_SIZE = 20
  const [textureSetPage, setTextureSetPage] = useState(1)
  const [textureSetTotalCount, setTextureSetTotalCount] = useState(0)
  const [spritePage, setSpritePage] = useState(1)
  const [spriteTotalCount, setSpriteTotalCount] = useState(0)
  const [soundPage, setSoundPage] = useState(1)
  const [soundTotalCount, setSoundTotalCount] = useState(0)

  // Active tab
  const [activeTabIndex, setActiveTabIndex] = useState(0)

  const label = adapter.label
  const labelLower = label.toLowerCase()

  useEffect(() => {
    loadContainer()
    loadAllContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reload content when target container changes
  }, [adapter.containerId])

  const loadContainer = async () => {
    try {
      const data = await adapter.loadContainer(adapter.containerId)
      setContainer(data)
    } catch (error) {
      console.error(`Failed to load ${labelLower}:`, error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to load ${labelLower}`,
        life: 3000,
      })
    }
  }

  const loadTextureSets = async (loadMore = false) => {
    try {
      const page = loadMore ? textureSetPage + 1 : 1
      const filterOptions: {
        page: number
        pageSize: number
        packId?: number
        projectId?: number
      } = {
        page,
        pageSize: PAGE_SIZE,
      }
      if (adapter.type === 'pack') filterOptions.packId = adapter.containerId
      if (adapter.type === 'project')
        filterOptions.projectId = adapter.containerId

      const result = await getTextureSetsPaginated(filterOptions)
      setTextureSets(prev =>
        loadMore ? [...prev, ...result.textureSets] : result.textureSets
      )
      setTextureSetTotalCount(result.totalCount)
      setTextureSetPage(page)
    } catch (error) {
      console.error('Failed to load texture sets:', error)
    }
  }

  const loadSprites = async (loadMore = false) => {
    try {
      const page = loadMore ? spritePage + 1 : 1
      const filterOptions: {
        page: number
        pageSize: number
        packId?: number
        projectId?: number
      } = {
        page,
        pageSize: PAGE_SIZE,
      }
      if (adapter.type === 'pack') filterOptions.packId = adapter.containerId
      if (adapter.type === 'project')
        filterOptions.projectId = adapter.containerId

      const result = await getSpritesPaginated(filterOptions)
      setSprites(prev =>
        loadMore ? [...prev, ...result.sprites] : result.sprites
      )
      setSpriteTotalCount(result.totalCount)
      setSpritePage(page)
    } catch (error) {
      console.error('Failed to load sprites:', error)
    }
  }

  const loadSounds = async (loadMore = false) => {
    try {
      const page = loadMore ? soundPage + 1 : 1
      const filterOptions: {
        page: number
        pageSize: number
        packId?: number
        projectId?: number
      } = {
        page,
        pageSize: PAGE_SIZE,
      }
      if (adapter.type === 'pack') filterOptions.packId = adapter.containerId
      if (adapter.type === 'project')
        filterOptions.projectId = adapter.containerId

      const result = await getSoundsPaginated(filterOptions)
      setSounds(prev =>
        loadMore ? [...prev, ...result.sounds] : result.sounds
      )
      setSoundTotalCount(result.totalCount)
      setSoundPage(page)
    } catch (error) {
      console.error('Failed to load sounds:', error)
    }
  }

  const loadAllContent = async () => {
    setLoading(true)
    try {
      await Promise.all([loadTextureSets(), loadSprites(), loadSounds()])
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableTextureSets = async () => {
    try {
      const response = await getAllTextureSets()
      const textureSetIds = textureSets.map(ts => ts.id)
      const available = response.filter(ts => !textureSetIds.includes(ts.id))
      setAllTextureSets(available)
    } catch (error) {
      console.error('Failed to load texture sets:', error)
    }
  }

  const loadAvailableSprites = async () => {
    try {
      const response = await getAllSprites()
      const spriteIds = sprites.map(s => s.id)
      const available = (response.sprites || []).filter(
        s => !spriteIds.includes(s.id)
      )
      setAllSprites(available)
    } catch (error) {
      console.error('Failed to load sprites:', error)
    }
  }

  const loadAvailableSounds = async () => {
    try {
      const response = await getAllSounds()
      const soundIds = sounds.map(s => s.id)
      const available = (response.sounds || []).filter(
        s => !soundIds.includes(s.id)
      )
      setAllSounds(available)
    } catch (error) {
      console.error('Failed to load sounds:', error)
    }
  }

  const handleRemoveTextureSet = async (textureSetId: number) => {
    try {
      await adapter.removeTextureSet(adapter.containerId, textureSetId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Texture set removed from ${labelLower}`,
        life: 3000,
      })
      loadTextureSets()
      loadContainer()
    } catch (error) {
      console.error('Failed to remove texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove texture set from ${labelLower}`,
        life: 3000,
      })
    }
  }

  const handleRemoveSprite = async (spriteId: number) => {
    try {
      await adapter.removeSprite(adapter.containerId, spriteId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Sprite removed from ${labelLower}`,
        life: 3000,
      })
      loadSprites()
      loadContainer()
    } catch (error) {
      console.error('Failed to remove sprite:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove sprite from ${labelLower}`,
        life: 3000,
      })
    }
  }

  const handleRemoveSound = async (soundId: number) => {
    try {
      await adapter.removeSound(adapter.containerId, soundId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Sound removed from ${labelLower}`,
        life: 3000,
      })
      loadSounds()
      loadContainer()
    } catch (error) {
      console.error('Failed to remove sound:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove sound from ${labelLower}`,
        life: 3000,
      })
    }
  }

  const handleAddTextureSets = async () => {
    if (selectedTextureSetIds.length === 0) return

    try {
      await Promise.all(
        selectedTextureSetIds.map(textureSetId =>
          adapter.addTextureSet(adapter.containerId, textureSetId)
        )
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${selectedTextureSetIds.length} texture set(s) added to ${labelLower}`,
        life: 3000,
      })
      setShowAddTextureSetDialog(false)
      setSelectedTextureSetIds([])
      loadTextureSets()
      loadContainer()
    } catch (error) {
      console.error('Failed to add texture sets:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to add texture sets to ${labelLower}`,
        life: 3000,
      })
    }
  }

  const handleAddSprites = async () => {
    if (selectedSpriteIds.length === 0) return

    try {
      await Promise.all(
        selectedSpriteIds.map(spriteId =>
          adapter.addSprite(adapter.containerId, spriteId)
        )
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${selectedSpriteIds.length} sprite(s) added to ${labelLower}`,
        life: 3000,
      })
      setShowAddSpriteDialog(false)
      setSelectedSpriteIds([])
      loadSprites()
      loadContainer()
    } catch (error) {
      console.error('Failed to add sprites:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to add sprites to ${labelLower}`,
        life: 3000,
      })
    }
  }

  const handleAddSounds = async () => {
    if (selectedSoundIds.length === 0) return

    try {
      await Promise.all(
        selectedSoundIds.map(soundId =>
          adapter.addSound(adapter.containerId, soundId)
        )
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${selectedSoundIds.length} sound(s) added to ${labelLower}`,
        life: 3000,
      })
      setShowAddSoundDialog(false)
      setSelectedSoundIds([])
      loadSounds()
      loadContainer()
    } catch (error) {
      console.error('Failed to add sounds:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to add sounds to ${labelLower}`,
        life: 3000,
      })
    }
  }

  const handleTextureUpload = async (files: File[]) => {
    if (files.length === 0) return

    try {
      setUploadingTextureSet(true)

      let newCount = 0

      const batchId = uploadProgressContext
        ? uploadProgressContext.createBatch()
        : undefined

      const uploadPromises = files.map(async file => {
        let uploadId: string | null = null
        try {
          uploadId =
            uploadProgressContext?.addUpload(file, 'texture', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 30)
          }

          const setName = file.name.replace(/\.[^/.]+$/, '')

          const response = await adapter.uploadTextureWithFile(
            adapter.containerId,
            file,
            setName,
            1, // TextureType.Albedo (enum starts at 1)
            batchId
          )

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, response)
          }

          newCount++
          return response.textureSetId
        } catch (error) {
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          throw error
        }
      })

      await Promise.all(uploadPromises)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${newCount} texture(s) uploaded and added to ${labelLower}`,
        life: 3000,
      })
      loadTextureSets()
      loadContainer()
    } catch (error) {
      console.error('Failed to upload textures:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload textures',
        life: 3000,
      })
    } finally {
      setUploadingTextureSet(false)
    }
  }

  const handleTextureDrop = (files: File[]) => {
    handleTextureUpload(files)
  }

  const handleSpriteUpload = async (files: File[]) => {
    if (files.length === 0) return

    try {
      setUploadingSprite(true)

      let newCount = 0

      const batchId = uploadProgressContext
        ? uploadProgressContext.createBatch()
        : undefined

      const uploadPromises = files.map(async file => {
        let uploadId: string | null = null
        try {
          uploadId =
            uploadProgressContext?.addUpload(file, 'sprite', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 30)
          }

          const spriteName = file.name.replace(/\.[^/.]+$/, '')

          const spriteOptions = adapter.createSpriteOptions(adapter.containerId)
          const response = await createSpriteWithFile(file, {
            name: spriteName,
            batchId,
            ...spriteOptions,
          })

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 70)
          }

          await adapter.addSprite(adapter.containerId, response.spriteId)

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, response)
          }

          newCount++
          return response.spriteId
        } catch (error) {
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          throw error
        }
      })

      await Promise.all(uploadPromises)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${newCount} sprite(s) uploaded and added to ${labelLower}`,
        life: 3000,
      })
      loadSprites()
      loadContainer()
    } catch (error) {
      console.error('Failed to upload sprites:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload sprites',
        life: 3000,
      })
    } finally {
      setUploadingSprite(false)
    }
  }

  const handleSpriteDrop = (files: File[]) => {
    handleSpriteUpload(files)
  }

  const handleSoundUpload = async (files: File[]) => {
    if (files.length === 0) return

    const audioFiles = filterAudioFiles(files)

    if (audioFiles.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop audio files only',
        life: 3000,
      })
      return
    }

    try {
      setUploadingSound(true)

      let newCount = 0

      const batchId = uploadProgressContext
        ? uploadProgressContext.createBatch()
        : undefined

      const uploadPromises = audioFiles.map(async file => {
        let uploadId: string | null = null
        try {
          uploadId =
            uploadProgressContext?.addUpload(file, 'file', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 20)
          }

          const { duration, peaks } = await processAudioFile(file)

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 40)
          }

          const soundName = file.name.replace(/\.[^/.]+$/, '')

          const response = await createSoundWithFile(file, {
            name: soundName,
            duration,
            peaks,
          })

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 70)
          }

          await adapter.addSound(adapter.containerId, response.soundId)

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, response)
          }

          newCount++
          return response.soundId
        } catch (error) {
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          throw error
        }
      })

      await Promise.all(uploadPromises)

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `${newCount} sound(s) uploaded and added to ${labelLower}`,
        life: 3000,
      })
      loadSounds()
      loadContainer()
    } catch (error) {
      console.error('Failed to upload sounds:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to upload sounds',
        life: 3000,
      })
    } finally {
      setUploadingSound(false)
    }
  }

  const handleSoundDrop = (files: File[]) => {
    handleSoundUpload(files)
  }

  const toggleTextureSetSelection = (textureSetId: number) => {
    setSelectedTextureSetIds(prev =>
      prev.includes(textureSetId)
        ? prev.filter(id => id !== textureSetId)
        : [...prev, textureSetId]
    )
  }

  const toggleSpriteSelection = (spriteId: number) => {
    setSelectedSpriteIds(prev =>
      prev.includes(spriteId)
        ? prev.filter(id => id !== spriteId)
        : [...prev, spriteId]
    )
  }

  const getAlbedoTextureUrl = (textureSet: TextureSetDto) => {
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    const diffuseType = (TextureType as unknown as Record<string, number>)
      .Diffuse
    const diffuse =
      typeof diffuseType === 'number'
        ? textureSet.textures?.find(t => t.textureType === diffuseType)
        : undefined
    const texture = albedo || diffuse
    if (texture) {
      return getFileUrl(texture.fileId.toString())
    }
    return null
  }

  const getSpriteTypeName = (type: number): string => {
    switch (type) {
      case 1:
        return 'Static'
      case 2:
        return 'Sprite Sheet'
      case 3:
        return 'GIF'
      case 4:
        return 'APNG'
      case 5:
        return 'Animated WebP'
      default:
        return 'Unknown'
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const openSpriteModal = (sprite: SpriteDto) => {
    setSelectedSprite(sprite)
    setShowSpriteModal(true)
  }

  const handleDownloadSprite = async () => {
    if (!selectedSprite) return

    try {
      const url = getFileUrl(selectedSprite.fileId.toString())
      const response = await fetch(url)
      const blob = await response.blob()

      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const extension = selectedSprite.fileName.split('.').pop() || 'png'
      link.download = `${selectedSprite.name}.${extension}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error('Failed to download sprite:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download sprite',
        life: 3000,
      })
    }
  }

  const textureSetContextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (selectedTextureSet) {
          handleRemoveTextureSet(selectedTextureSet.id)
        }
      },
    },
  ]

  const spriteContextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (selectedSprite) {
          handleRemoveSprite(selectedSprite.id)
        }
      },
    },
  ]

  const soundContextMenuItems: MenuItem[] = [
    {
      label: `Remove from ${labelLower}`,
      icon: 'pi pi-times',
      command: () => {
        if (selectedSound) {
          handleRemoveSound(selectedSound.id)
        }
      },
    },
  ]

  const filteredAvailableTextureSets = allTextureSets.filter(textureSet => {
    const name = textureSet.name.toLowerCase()
    return name.includes(textureSetSearchQuery.toLowerCase())
  })

  const filteredAvailableSprites = allSprites.filter(sprite => {
    const name = sprite.name.toLowerCase()
    return name.includes(spriteSearchQuery.toLowerCase())
  })

  const filteredAvailableSounds = allSounds.filter(sound => {
    const name = sound.name.toLowerCase()
    return name.includes(soundSearchQuery.toLowerCase())
  })

  if (!container) {
    return <div>Loading...</div>
  }

  return (
    <div className="container-viewer">
      <Toast ref={toast} />
      <ContextMenu
        model={textureSetContextMenuItems}
        ref={textureSetContextMenu}
      />
      <ContextMenu model={spriteContextMenuItems} ref={spriteContextMenu} />
      <ContextMenu model={soundContextMenuItems} ref={soundContextMenu} />

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
          {/* Details Tab */}
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

          {/* Models Tab */}
          <TabPanel header={`Models: ${modelTotalCount}`}>
            <ModelGrid
              {...(adapter.type === 'pack'
                ? { packId: adapter.containerId }
                : { projectId: adapter.containerId })}
              onTotalCountChange={setModelTotalCount}
            />
          </TabPanel>

          {/* Texture Sets Tab */}
          <TabPanel header={`Texture Sets: ${textureSetTotalCount}`}>
            <UploadableGrid
              onFilesDropped={handleTextureDrop}
              isUploading={uploadingTextureSet}
              uploadMessage={`Drop texture files here to create and add to ${labelLower}`}
              className="container-grid-wrapper"
            >
              <div className="container-section">
                <div className="container-grid">
                  {textureSets.map(textureSet => {
                    const albedoUrl = getAlbedoTextureUrl(textureSet)
                    return (
                      <div
                        key={textureSet.id}
                        className="container-card"
                        onClick={() =>
                          openTextureSetDetailsTab(
                            textureSet.id,
                            textureSet.name
                          )
                        }
                        onContextMenu={e => {
                          e.preventDefault()
                          setSelectedTextureSet(textureSet)
                          textureSetContextMenu.current?.show(e)
                        }}
                      >
                        <div className="container-card-thumbnail">
                          {albedoUrl ? (
                            <img
                              src={albedoUrl}
                              alt={textureSet.name}
                              className="container-card-image"
                            />
                          ) : (
                            <div className="container-card-placeholder">
                              <i className="pi pi-image" />
                              <span>No Preview</span>
                            </div>
                          )}
                          <div className="container-card-overlay">
                            <span className="container-card-name">
                              {textureSet.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* Add New Card */}
                  <div
                    className="container-card container-card-add"
                    onClick={() => {
                      loadAvailableTextureSets()
                      setTextureSetSearchQuery('')
                      setSelectedTextureSetIds([])
                      setShowAddTextureSetDialog(true)
                    }}
                  >
                    <div className="container-card-add-content">
                      <i className="pi pi-plus" />
                      <span>Add Texture Set</span>
                    </div>
                  </div>
                </div>
                {textureSets.length < textureSetTotalCount && (
                  <div className="container-load-more">
                    <Button
                      label={`Load More (${textureSets.length} of ${textureSetTotalCount})`}
                      icon="pi pi-angle-down"
                      className="p-button-text"
                      onClick={() => loadTextureSets(true)}
                    />
                  </div>
                )}
              </div>
            </UploadableGrid>
          </TabPanel>

          {/* Sprites Tab */}
          <TabPanel header={`Sprites: ${spriteTotalCount}`}>
            <UploadableGrid
              onFilesDropped={handleSpriteDrop}
              isUploading={uploadingSprite}
              uploadMessage={`Drop image files here to create sprites and add to ${labelLower}`}
              className="container-grid-wrapper"
            >
              <div className="container-section">
                <div className="container-grid">
                  {sprites.map(sprite => {
                    const spriteUrl = getFileUrl(sprite.fileId.toString())
                    return (
                      <div
                        key={sprite.id}
                        className="container-card"
                        onClick={() => openSpriteModal(sprite)}
                        onContextMenu={e => {
                          e.preventDefault()
                          setSelectedSprite(sprite)
                          spriteContextMenu.current?.show(e)
                        }}
                      >
                        <div className="container-card-thumbnail">
                          {spriteUrl ? (
                            <img
                              src={spriteUrl}
                              alt={sprite.name}
                              className="container-card-image"
                            />
                          ) : (
                            <div className="container-card-placeholder">
                              <i className="pi pi-image" />
                              <span>No Preview</span>
                            </div>
                          )}
                          <div className="container-card-overlay">
                            <span className="container-card-name">
                              {sprite.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* Add New Card */}
                  <div
                    className="container-card container-card-add"
                    onClick={() => {
                      loadAvailableSprites()
                      setSpriteSearchQuery('')
                      setSelectedSpriteIds([])
                      setShowAddSpriteDialog(true)
                    }}
                  >
                    <div className="container-card-add-content">
                      <i className="pi pi-plus" />
                      <span>Add Sprite</span>
                    </div>
                  </div>
                </div>
                {sprites.length < spriteTotalCount && (
                  <div className="container-load-more">
                    <Button
                      label={`Load More (${sprites.length} of ${spriteTotalCount})`}
                      icon="pi pi-angle-down"
                      className="p-button-text"
                      onClick={() => loadSprites(true)}
                    />
                  </div>
                )}
              </div>
            </UploadableGrid>
          </TabPanel>

          {/* Sounds Tab */}
          <TabPanel header={`Sounds: ${soundTotalCount}`}>
            <UploadableGrid
              onFilesDropped={handleSoundDrop}
              isUploading={uploadingSound}
              uploadMessage={`Drop audio files here to create sounds and add to ${labelLower}`}
              className="container-grid-wrapper"
            >
              <div className="container-section">
                <div className="container-grid">
                  {sounds.map(sound => (
                    <div
                      key={sound.id}
                      className="container-card"
                      onClick={() => {
                        setSelectedSound(sound)
                        setShowSoundModal(true)
                      }}
                      onContextMenu={e => {
                        e.preventDefault()
                        setSelectedSound(sound)
                        soundContextMenu.current?.show(e)
                      }}
                    >
                      <div className="container-card-thumbnail">
                        <div className="container-card-placeholder">
                          <i className="pi pi-volume-up" />
                          <span>{formatDuration(sound.duration)}</span>
                        </div>
                        <div className="container-card-overlay">
                          <span className="container-card-name">
                            {sound.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Add New Card */}
                  <div
                    className="container-card container-card-add"
                    onClick={() => {
                      loadAvailableSounds()
                      setSoundSearchQuery('')
                      setSelectedSoundIds([])
                      setShowAddSoundDialog(true)
                    }}
                  >
                    <div className="container-card-add-content">
                      <i className="pi pi-plus" />
                      <span>Add Sound</span>
                    </div>
                  </div>
                </div>
                {sounds.length < soundTotalCount && (
                  <div className="container-load-more">
                    <Button
                      label={`Load More (${sounds.length} of ${soundTotalCount})`}
                      icon="pi pi-angle-down"
                      className="p-button-text"
                      onClick={() => loadSounds(true)}
                    />
                  </div>
                )}
              </div>
            </UploadableGrid>
          </TabPanel>
        </TabView>
      </div>

      {/* Add Texture Set Dialog */}
      <Dialog
        header={`Add Texture Sets to ${label}`}
        visible={showAddTextureSetDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          setShowAddTextureSetDialog(false)
          setSelectedTextureSetIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowAddTextureSetDialog(false)
                setSelectedTextureSetIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${selectedTextureSetIds.length})`}
              icon="pi pi-check"
              onClick={handleAddTextureSets}
              disabled={selectedTextureSetIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search texture sets..."
              value={textureSetSearchQuery}
              onChange={e => setTextureSetSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="container-grid scrollable-grid">
            {filteredAvailableTextureSets.map(textureSet => {
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              const isSelected = selectedTextureSetIds.includes(textureSet.id)
              return (
                <div
                  key={textureSet.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleTextureSetSelection(textureSet.id)}
                >
                  <div className="container-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleTextureSetSelection(textureSet.id)}
                    />
                  </div>
                  <div className="container-card-thumbnail">
                    {albedoUrl ? (
                      <img
                        src={albedoUrl}
                        alt={textureSet.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">
                        {textureSet.name}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredAvailableTextureSets.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No texture sets available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Add Sprite Dialog */}
      <Dialog
        header={`Add Sprites to ${label}`}
        visible={showAddSpriteDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          setShowAddSpriteDialog(false)
          setSelectedSpriteIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowAddSpriteDialog(false)
                setSelectedSpriteIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${selectedSpriteIds.length})`}
              icon="pi pi-check"
              onClick={handleAddSprites}
              disabled={selectedSpriteIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search sprites..."
              value={spriteSearchQuery}
              onChange={e => setSpriteSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="container-grid scrollable-grid">
            {filteredAvailableSprites.map(sprite => {
              const spriteUrl = getFileUrl(sprite.fileId.toString())
              const isSelected = selectedSpriteIds.includes(sprite.id)
              return (
                <div
                  key={sprite.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSpriteSelection(sprite.id)}
                >
                  <div className="container-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSpriteSelection(sprite.id)}
                    />
                  </div>
                  <div className="container-card-thumbnail">
                    {spriteUrl ? (
                      <img
                        src={spriteUrl}
                        alt={sprite.name}
                        className="container-card-image"
                      />
                    ) : (
                      <div className="container-card-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="container-card-overlay">
                      <span className="container-card-name">{sprite.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredAvailableSprites.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No sprites available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Sprite Detail Modal */}
      <Dialog
        header={selectedSprite?.name || 'Sprite'}
        visible={showSpriteModal}
        onHide={() => setShowSpriteModal(false)}
        style={{ width: '600px' }}
        className="sprite-detail-modal"
      >
        {selectedSprite && (
          <div className="sprite-modal-content">
            <div className="sprite-modal-preview">
              <img
                src={getFileUrl(selectedSprite.fileId.toString())}
                alt={selectedSprite.name}
              />
            </div>
            <div className="sprite-modal-info">
              <div className="sprite-modal-details">
                <p>
                  <strong>Type:</strong>{' '}
                  {getSpriteTypeName(selectedSprite.spriteType)}
                </p>
                <p>
                  <strong>File:</strong> {selectedSprite.fileName}
                </p>
                <p>
                  <strong>Size:</strong>{' '}
                  {formatFileSize(selectedSprite.fileSizeBytes)}
                </p>
                <p>
                  <strong>Category:</strong>{' '}
                  {selectedSprite.categoryName || 'Unassigned'}
                </p>
              </div>
              <div className="sprite-modal-download">
                <Button
                  label="Download"
                  icon="pi pi-download"
                  onClick={handleDownloadSprite}
                  className="p-button-success w-full"
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Add Sound Dialog */}
      <Dialog
        header={`Add Sounds to ${label}`}
        visible={showAddSoundDialog}
        style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
        onHide={() => {
          setShowAddSoundDialog(false)
          setSelectedSoundIds([])
        }}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => {
                setShowAddSoundDialog(false)
                setSelectedSoundIds([])
              }}
              className="p-button-text"
            />
            <Button
              label={`Add Selected (${selectedSoundIds.length})`}
              icon="pi pi-check"
              onClick={handleAddSounds}
              disabled={selectedSoundIds.length === 0}
            />
          </div>
        }
      >
        <div className="add-dialog-content">
          <div className="search-bar">
            <i className="pi pi-search" />
            <InputText
              type="text"
              placeholder="Search sounds..."
              value={soundSearchQuery}
              onChange={e => setSoundSearchQuery(e.target.value)}
              className="search-input"
              style={{ width: '100%' }}
            />
          </div>
          <div className="container-grid scrollable-grid">
            {filteredAvailableSounds.map(sound => {
              const isSelected = selectedSoundIds.includes(sound.id)
              return (
                <div
                  key={sound.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSoundIds(prev =>
                      prev.includes(sound.id)
                        ? prev.filter(id => id !== sound.id)
                        : [...prev, sound.id]
                    )
                  }}
                >
                  <div className="container-card-checkbox">
                    <Checkbox checked={isSelected} readOnly />
                  </div>
                  <div className="container-card-thumbnail">
                    <div className="container-card-placeholder">
                      <i className="pi pi-volume-up" />
                      <span>{formatDuration(sound.duration)}</span>
                    </div>
                    <div className="container-card-overlay">
                      <span className="container-card-name">{sound.name}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filteredAvailableSounds.length === 0 && (
            <div className="no-results">
              <i className="pi pi-inbox" />
              <p>No sounds available to add</p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Sound Detail Modal */}
      <Dialog
        header={selectedSound?.name || 'Sound'}
        visible={showSoundModal}
        onHide={() => setShowSoundModal(false)}
        style={{ width: '600px' }}
        className="sound-detail-modal"
      >
        {selectedSound && (
          <div className="sound-modal-content">
            <div className="sound-modal-preview">
              <audio
                controls
                src={getFileUrl(selectedSound.fileId.toString())}
                style={{ width: '100%' }}
              />
            </div>
            <div className="sound-modal-info">
              <div className="sound-modal-details">
                <p>
                  <strong>Duration:</strong>{' '}
                  {formatDuration(selectedSound.duration)}
                </p>
                <p>
                  <strong>File:</strong> {selectedSound.fileName}
                </p>
                <p>
                  <strong>Size:</strong>{' '}
                  {formatFileSize(selectedSound.fileSizeBytes)}
                </p>
                <p>
                  <strong>Category:</strong>{' '}
                  {selectedSound.categoryName || 'Unassigned'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
