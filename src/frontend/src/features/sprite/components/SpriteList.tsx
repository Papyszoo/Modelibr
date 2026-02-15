import {
  useState,
  useEffect,
  useCallback,
  useRef,
  DragEvent,
  MouseEvent,
} from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Toast } from 'primereact/toast'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Checkbox } from 'primereact/checkbox'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import {
  getSpritesQueryOptions,
  useSpritesQuery,
  useSpriteCategoriesQuery,
} from '@/features/sprite/api/queries'
import {
  createSpriteCategory,
  createSpriteWithFile,
  deleteSpriteCategory,
  softDeleteSprite,
  updateSprite,
  updateSpriteCategory,
} from '@/features/sprite/api/spriteApi'
import { getFileUrl } from '@/features/models/api/modelApi'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import {
  openInFileExplorer,
  copyPathToClipboard,
  getCopyPathSuccessMessage,
} from '@/utils/webdavUtils'
import {
  spriteCategoryFormSchema,
  spriteRenameFormSchema,
} from '@/shared/validation/formSchemas'
import { PaginationState } from '@/types'
import './SpriteList.css'

interface SpriteDto {
  id: number
  name: string
  fileId: number
  spriteType: number
  categoryId: number | null
  categoryName: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
}

interface SpriteCategoryDto {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

const UNASSIGNED_CATEGORY_ID = -1
const SPRITE_TYPE_STATIC = 1
const SPRITE_TYPE_GIF = 3

export function SpriteList() {
  type SpriteCategoryFormInput = z.input<typeof spriteCategoryFormSchema>
  type SpriteCategoryFormOutput = z.output<typeof spriteCategoryFormSchema>
  type SpriteRenameFormValues = z.infer<typeof spriteRenameFormSchema>

  const [sprites, setSprites] = useState<SpriteDto[]>([])
  const [categories, setCategories] = useState<SpriteCategoryDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showSpriteModal, setShowSpriteModal] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<SpriteCategoryDto | null>(null)
  const [selectedSprite, setSelectedSprite] = useState<SpriteDto | null>(null)
  const [isEditingSpriteName, setIsEditingSpriteName] = useState(false)
  const [isSavingSpriteName, setIsSavingSpriteName] = useState(false)
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(
    UNASSIGNED_CATEGORY_ID
  )
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const [draggedSpriteId, setDraggedSpriteId] = useState<number | null>(null)
  const [selectedSpriteIds, setSelectedSpriteIds] = useState<Set<number>>(
    new Set()
  )
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
  })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const spriteGridRef = useRef<HTMLDivElement>(null)
  const toast = useRef<Toast>(null)
  const uploadProgressContext = useUploadProgress()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<ContextMenu>(null)
  const [contextMenuTarget, setContextMenuTarget] = useState<SpriteDto | null>(
    null
  )

  const {
    register: registerCategory,
    handleSubmit: handleCategorySubmit,
    reset: resetCategoryForm,
  } = useForm<SpriteCategoryFormInput, unknown, SpriteCategoryFormOutput>({
    resolver: zodResolver(spriteCategoryFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const {
    register: registerSpriteRename,
    handleSubmit: handleSpriteRenameSubmit,
    reset: resetSpriteRenameForm,
  } = useForm<SpriteRenameFormValues>({
    resolver: zodResolver(spriteRenameFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
    },
  })

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.sprites

  const queryClient = useQueryClient()
  const spritesQuery = useSpritesQuery({ params: { page: 1, pageSize: 50 } })
  const categoriesQuery = useSpriteCategoriesQuery()

  // Sync initial query data into local state (for load-more accumulation)
  useEffect(() => {
    if (spritesQuery.data && pagination.page === 1) {
      setSprites(spritesQuery.data.sprites || [])
      setPagination({
        page: 1,
        pageSize: spritesQuery.data.pageSize,
        totalCount: spritesQuery.data.totalCount,
        totalPages: spritesQuery.data.totalPages,
        hasMore: 1 < spritesQuery.data.totalPages,
      })
      setLoading(false)
    }
  }, [spritesQuery.data, pagination.page])

  useEffect(() => {
    if (categoriesQuery.data) {
      setCategories(categoriesQuery.data.categories || [])
    }
  }, [categoriesQuery.data])

  const loadSprites = useCallback(
    async (loadMore = false) => {
      if (!loadMore) {
        // For full refresh, invalidate React Query and let it refetch
        queryClient.invalidateQueries({ queryKey: ['sprites'] })
        return
      }
      // Load more: fetch next page manually and append
      try {
        setIsLoadingMore(true)
        const page = pagination.page + 1
        const result = await queryClient.fetchQuery(
          getSpritesQueryOptions({
            page,
            pageSize: 50,
          })
        )
        setSprites(prev => [...prev, ...result.sprites])
        setPagination({
          page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          hasMore: page < result.totalPages,
        })
      } catch (error) {
        console.error('Failed to load more sprites:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load more sprites',
          life: 3000,
        })
      } finally {
        setIsLoadingMore(false)
      }
    },
    [pagination.page, queryClient]
  )

  const loadCategories = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['spriteCategories'] })
  }, [queryClient])

  const saveCategoryMutation = useMutation({
    mutationFn: async (vars: {
      editingCategory: SpriteCategoryDto | null
      name: string
      description?: string
    }): Promise<{ type: 'create' | 'update'; createdId?: number }> => {
      if (vars.editingCategory) {
        await updateSpriteCategory(
          vars.editingCategory.id,
          vars.name,
          vars.description
        )
        return { type: 'update' }
      }

      const created = await createSpriteCategory(vars.name, vars.description)
      return { type: 'create', createdId: created.id }
    },
    onSuccess: async (result, vars) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: vars.editingCategory
          ? 'Category updated successfully'
          : 'Category created successfully',
        life: 3000,
      })

      if (result.type === 'create' && typeof result.createdId === 'number') {
        setActiveCategoryId(result.createdId)
      }

      setShowCategoryDialog(false)
      await loadCategories()
      await loadSprites()
    },
    onError: error => {
      console.error('Failed to save category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save category',
        life: 3000,
      })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      await deleteSpriteCategory(categoryId)
    },
    onSuccess: async (_data, categoryId) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Category deleted successfully',
        life: 3000,
      })
      if (activeCategoryId === categoryId) {
        setActiveCategoryId(UNASSIGNED_CATEGORY_ID)
      }
      await loadCategories()
      await loadSprites()
    },
    onError: error => {
      console.error('Failed to delete category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete category',
        life: 3000,
      })
    },
  })

  const moveSpritesToCategoryMutation = useMutation({
    mutationFn: async (vars: {
      spriteIds: number[]
      categoryId: number | null
    }) => {
      await Promise.all(
        vars.spriteIds.map(id =>
          updateSprite(id, { categoryId: vars.categoryId })
        )
      )
    },
    onSuccess: async (_data, vars) => {
      const targetCategoryName =
        vars.categoryId === null
          ? 'Unassigned'
          : categories.find(c => c.id === vars.categoryId)?.name ||
            'Unknown Category'
      const message =
        vars.spriteIds.length === 1
          ? `Sprite moved to ${targetCategoryName}`
          : `${vars.spriteIds.length} sprites moved to ${targetCategoryName}`

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: message,
        life: 3000,
      })
      setSelectedSpriteIds(new Set())
      await loadSprites()
    },
    onError: error => {
      console.error('Failed to update sprite category:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update sprite category',
        life: 3000,
      })
    },
  })

  const recycleSpritesMutation = useMutation({
    mutationFn: async (spriteIds: number[]) => {
      await Promise.all(spriteIds.map(id => softDeleteSprite(id)))
    },
    onSuccess: async (_data, spriteIds) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Recycled',
        detail:
          spriteIds.length > 1
            ? `${spriteIds.length} sprites moved to recycle bin`
            : 'Sprite moved to recycle bin',
        life: 3000,
      })
      setSelectedSpriteIds(new Set())
      setContextMenuTarget(null)
      await loadSprites()
    },
    onError: error => {
      console.error('Failed to recycle sprites:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle sprites',
        life: 3000,
      })
    },
  })

  const renameSpriteMutation = useMutation({
    mutationFn: async (vars: { sprite: SpriteDto; newName: string }) => {
      await updateSprite(vars.sprite.id, { name: vars.newName })
    },
    onSuccess: (_data, vars) => {
      setSelectedSprite({ ...vars.sprite, name: vars.newName })
      setSprites(prev =>
        prev.map(s =>
          s.id === vars.sprite.id ? { ...s, name: vars.newName } : s
        )
      )
      setIsEditingSpriteName(false)
      toast.current?.show({
        severity: 'success',
        summary: 'Updated',
        detail: `Sprite renamed to "${vars.newName}"`,
        life: 3000,
      })
    },
    onError: (error, vars) => {
      console.error('Failed to rename sprite:', error)
      resetSpriteRenameForm({ name: vars.sprite.name })
      setIsEditingSpriteName(false)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to rename sprite',
        life: 3000,
      })
    },
    onSettled: () => {
      setIsSavingSpriteName(false)
    },
  })

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    const imageFiles = fileArray.filter(
      file =>
        file.type.startsWith('image/') ||
        /\.(png|jpg|jpeg|gif|webp|apng|bmp|svg)$/i.test(file.name)
    )

    if (imageFiles.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop image files only',
        life: 3000,
      })
      return
    }

    const batchId = uploadProgressContext?.createBatch() || undefined
    const categoryIdToAssign =
      activeCategoryId === UNASSIGNED_CATEGORY_ID
        ? undefined
        : (activeCategoryId ?? undefined)

    for (const file of imageFiles) {
      let uploadId: string | null = null
      try {
        uploadId =
          uploadProgressContext?.addUpload(file, 'sprite', batchId) || null

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await createSpriteWithFile(file, {
          name: fileName,
          spriteType:
            file.type === 'image/gif' ? SPRITE_TYPE_GIF : SPRITE_TYPE_STATIC,
          categoryId: categoryIdToAssign,
          batchId,
        })

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            spriteId: result.spriteId,
          })
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Sprite "${fileName}" created successfully`,
          life: 3000,
        })
      } catch (error) {
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create sprite from file:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create sprite from ${file.name}`,
          life: 3000,
        })
      }
    }

    loadSprites()
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

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

  const openCreateCategoryDialog = () => {
    setEditingCategory(null)
    resetCategoryForm({ name: '', description: '' })
    setShowCategoryDialog(true)
  }

  const openEditCategoryDialog = (category: SpriteCategoryDto) => {
    setEditingCategory(category)
    resetCategoryForm({
      name: category.name,
      description: category.description || '',
    })
    setShowCategoryDialog(true)
  }

  const handleSaveCategory = handleCategorySubmit(
    async values => {
      saveCategoryMutation.mutate({
        editingCategory,
        name: values.name,
        description: values.description,
      })
    },
    () => {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Category name is required',
        life: 3000,
      })
    }
  )

  const handleDeleteCategory = (category: SpriteCategoryDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the category "${category.name}"? Sprites in this category will become unassigned.`,
      header: 'Delete Category',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        await deleteCategoryMutation.mutateAsync(category.id)
      },
    })
  }

  const openSpriteModal = (sprite: SpriteDto) => {
    setSelectedSprite(sprite)
    resetSpriteRenameForm({ name: sprite.name })
    setIsEditingSpriteName(false)
    setShowSpriteModal(true)
  }

  const handleSaveSpriteName = handleSpriteRenameSubmit(values => {
    if (!selectedSprite) return
    const trimmedName = values.name
    if (!trimmedName || trimmedName === selectedSprite.name) {
      setIsEditingSpriteName(false)
      resetSpriteRenameForm({ name: selectedSprite.name })
      return
    }
    setIsSavingSpriteName(true)
    renameSpriteMutation.mutate({
      sprite: selectedSprite,
      newName: trimmedName,
    })
  })

  const handleDownload = async () => {
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

  const toggleSpriteSelection = (spriteId: number, e: MouseEvent) => {
    e.stopPropagation()
    setSelectedSpriteIds(prev => {
      const next = new Set(prev)
      if (next.has(spriteId)) {
        next.delete(spriteId)
      } else {
        next.add(spriteId)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedSpriteIds(new Set())
  }

  const handleGridMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.sprite-card')) {
      return
    }
    if (spriteGridRef.current) {
      const rect = spriteGridRef.current.getBoundingClientRect()
      setIsAreaSelecting(true)
      setSelectionBox({
        startX: e.clientX - rect.left + spriteGridRef.current.scrollLeft,
        startY: e.clientY - rect.top + spriteGridRef.current.scrollTop,
        currentX: e.clientX - rect.left + spriteGridRef.current.scrollLeft,
        currentY: e.clientY - rect.top + spriteGridRef.current.scrollTop,
      })
    }
  }

  const handleGridMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isAreaSelecting || !selectionBox || !spriteGridRef.current) return
    const gridRef = spriteGridRef.current
    const rect = gridRef.getBoundingClientRect()
    setSelectionBox(prev =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - rect.left + gridRef.scrollLeft,
            currentY: e.clientY - rect.top + gridRef.scrollTop,
          }
        : null
    )
  }

  const handleGridMouseUp = () => {
    if (isAreaSelecting && selectionBox && spriteGridRef.current) {
      const rect = spriteGridRef.current.getBoundingClientRect()
      const selectionLeft = Math.min(selectionBox.startX, selectionBox.currentX)
      const selectionTop = Math.min(selectionBox.startY, selectionBox.currentY)
      const selectionRight = Math.max(
        selectionBox.startX,
        selectionBox.currentX
      )
      const selectionBottom = Math.max(
        selectionBox.startY,
        selectionBox.currentY
      )

      const cards = spriteGridRef.current.querySelectorAll('.sprite-card')
      const newSelected = new Set<number>()

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft =
          cardRect.left - rect.left + spriteGridRef.current!.scrollLeft
        const cardTop =
          cardRect.top - rect.top + spriteGridRef.current!.scrollTop
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height

        if (
          cardRight >= selectionLeft &&
          cardLeft <= selectionRight &&
          cardBottom >= selectionTop &&
          cardTop <= selectionBottom
        ) {
          const spriteId = card.getAttribute('data-sprite-id')
          if (spriteId) {
            newSelected.add(parseInt(spriteId, 10))
          }
        }
      })

      if (newSelected.size > 0) {
        setSelectedSpriteIds(newSelected)
      }
    }
    setIsAreaSelecting(false)
    setSelectionBox(null)
  }

  const handleSpriteDragStart = (
    e: DragEvent<HTMLDivElement>,
    sprite: SpriteDto
  ) => {
    if (!selectedSpriteIds.has(sprite.id)) {
      setSelectedSpriteIds(new Set([sprite.id]))
    }
    setDraggedSpriteId(sprite.id)
    e.dataTransfer.effectAllowed = 'move'
    const spriteIdsToMove = selectedSpriteIds.has(sprite.id)
      ? Array.from(selectedSpriteIds)
      : [sprite.id]
    e.dataTransfer.setData('text/plain', spriteIdsToMove.join(','))
  }

  const handleSpriteDragEnd = () => {
    setDraggedSpriteId(null)
    setDragOverCategoryId(null)
  }

  const handleCategoryDragOver = (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedSpriteId !== null) {
      setDragOverCategoryId(categoryId)
    }
  }

  const handleCategoryDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)
  }

  const handleCategoryDrop = async (
    e: DragEvent<HTMLDivElement>,
    targetCategoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)

    if (draggedSpriteId === null) return

    const newCategoryId =
      targetCategoryId === UNASSIGNED_CATEGORY_ID ? null : targetCategoryId

    const spriteIdsToMove = selectedSpriteIds.has(draggedSpriteId)
      ? Array.from(selectedSpriteIds)
      : [draggedSpriteId]

    const spritesToMove = sprites.filter(
      s => spriteIdsToMove.includes(s.id) && s.categoryId !== newCategoryId
    )

    if (spritesToMove.length === 0) {
      setDraggedSpriteId(null)
      return
    }

    moveSpritesToCategoryMutation.mutate({
      spriteIds: spritesToMove.map(s => s.id),
      categoryId: newCategoryId,
    })

    setDraggedSpriteId(null)
  }

  const filteredSprites = sprites.filter(sprite => {
    if (activeCategoryId === UNASSIGNED_CATEGORY_ID) {
      return sprite.categoryId === null
    }
    return sprite.categoryId === activeCategoryId
  })

  // Handle "Show in Folder" from context menu
  const handleShowInFolder = async () => {
    // For unassigned sprites, show root Sprites folder
    // For categorized sprites, show the category folder
    let virtualPath = 'Sprites'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) {
        virtualPath = `Sprites/${category.name}`
      }
    }

    const result = await openInFileExplorer(virtualPath)
    toast.current?.show({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  // Handle "Copy Path" from context menu
  const handleCopyPath = async () => {
    // For unassigned sprites, copy path to root Sprites folder
    // For categorized sprites, copy path to the category folder
    let virtualPath = 'Sprites'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) {
        virtualPath = `Sprites/${category.name}`
      }
    }

    const result = await copyPathToClipboard(virtualPath)

    toast.current?.show({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? 'Copied' : 'Failed',
      detail: result.success
        ? getCopyPathSuccessMessage()
        : 'Failed to copy path to clipboard',
      life: 5000,
    })
  }

  // Handle recycling sprites via context menu
  const handleRecycleSprites = async () => {
    const spriteIdsToRecycle =
      selectedSpriteIds.size > 0
        ? Array.from(selectedSpriteIds)
        : contextMenuTarget
          ? [contextMenuTarget.id]
          : []

    if (spriteIdsToRecycle.length === 0) return

    recycleSpritesMutation.mutate(spriteIdsToRecycle)
  }

  // Get context menu items (dynamic label based on selection)
  const getContextMenuItems = (): MenuItem[] => {
    const selectedCount = selectedSpriteIds.size
    const label =
      selectedCount > 1 ? `Recycle ${selectedCount} sprites` : 'Recycle'

    return [
      {
        label: 'Show in Folder',
        icon: 'pi pi-folder-open',
        command: handleShowInFolder,
      },
      {
        label: 'Copy Folder Path',
        icon: 'pi pi-copy',
        command: handleCopyPath,
      },
      {
        separator: true,
      },
      {
        label,
        icon: 'pi pi-trash',
        command: handleRecycleSprites,
      },
    ]
  }

  // Handle right-click on sprite card
  const handleSpriteContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    sprite: SpriteDto
  ) => {
    e.preventDefault()
    // If right-clicked sprite is not in selection, select only that sprite
    if (!selectedSpriteIds.has(sprite.id)) {
      setSelectedSpriteIds(new Set([sprite.id]))
    }
    setContextMenuTarget(sprite)
    contextMenuRef.current?.show(e)
  }

  if (loading) {
    return (
      <div className="sprite-list-loading">
        <ProgressSpinner />
      </div>
    )
  }

  return (
    <div
      className="sprite-list"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ConfirmDialog />
      <ContextMenu ref={contextMenuRef} model={getContextMenuItems()} />

      <div className="sprite-list-header">
        <div className="sprite-list-title">
          <h2>Sprites</h2>
          <span className="sprite-count">{filteredSprites.length} sprites</span>
          {selectedSpriteIds.size > 0 && (
            <span className="selection-count">
              ({selectedSpriteIds.size} selected)
              <Button
                icon="pi pi-times"
                className="p-button-text p-button-sm clear-selection-btn"
                onClick={clearSelection}
                tooltip="Clear selection"
              />
            </span>
          )}
        </div>
        <div className="sprite-list-actions">
          <CardWidthSlider
            value={cardWidth}
            min={120}
            max={400}
            onChange={width => setCardWidth('sprites', width)}
          />
          <Button
            label="Add Category"
            icon="pi pi-plus"
            className="p-button-outlined"
            onClick={openCreateCategoryDialog}
          />
        </div>
      </div>

      <div className="sprite-category-tabs">
        <div
          className={`category-tab ${activeCategoryId === UNASSIGNED_CATEGORY_ID ? 'active' : ''} ${dragOverCategoryId === UNASSIGNED_CATEGORY_ID ? 'drag-over' : ''}`}
          onClick={() => setActiveCategoryId(UNASSIGNED_CATEGORY_ID)}
          onDragOver={e => handleCategoryDragOver(e, UNASSIGNED_CATEGORY_ID)}
          onDragLeave={handleCategoryDragLeave}
          onDrop={e => handleCategoryDrop(e, UNASSIGNED_CATEGORY_ID)}
        >
          <span>Unassigned</span>
          <span className="category-count">
            ({sprites.filter(s => s.categoryId === null).length})
          </span>
        </div>
        {categories.map(category => (
          <div
            key={category.id}
            className={`category-tab ${activeCategoryId === category.id ? 'active' : ''} ${dragOverCategoryId === category.id ? 'drag-over' : ''}`}
            onClick={() => setActiveCategoryId(category.id)}
            onDragOver={e => handleCategoryDragOver(e, category.id)}
            onDragLeave={handleCategoryDragLeave}
            onDrop={e => handleCategoryDrop(e, category.id)}
          >
            <span>{category.name}</span>
            <span className="category-count">
              ({sprites.filter(s => s.categoryId === category.id).length})
            </span>
            {activeCategoryId === category.id && (
              <div className="category-tab-actions">
                <Button
                  icon="pi pi-pencil"
                  className="p-button-text p-button-sm"
                  onClick={e => {
                    e.stopPropagation()
                    openEditCategoryDialog(category)
                  }}
                  tooltip="Rename category"
                />
                <Button
                  icon="pi pi-trash"
                  className="p-button-text p-button-sm p-button-danger"
                  onClick={e => {
                    e.stopPropagation()
                    handleDeleteCategory(category)
                  }}
                  tooltip="Delete category"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredSprites.length === 0 ? (
        <div className="sprite-list-empty">
          <i
            className="pi pi-image"
            style={{ fontSize: '3rem', marginBottom: '1rem' }}
          />
          <p>No sprites in this category</p>
          <p className="hint">Drag and drop image files here to upload</p>
        </div>
      ) : (
        <div
          className="sprite-grid-container"
          ref={spriteGridRef}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
          onMouseLeave={handleGridMouseUp}
        >
          <div
            className="sprite-grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {filteredSprites.map(sprite => (
              <div
                key={sprite.id}
                data-sprite-id={sprite.id}
                className={`sprite-card ${draggedSpriteId === sprite.id ? 'dragging' : ''} ${selectedSpriteIds.has(sprite.id) ? 'selected' : ''}`}
                onClick={() => openSpriteModal(sprite)}
                onContextMenu={e => handleSpriteContextMenu(e, sprite)}
                draggable
                onDragStart={e => handleSpriteDragStart(e, sprite)}
                onDragEnd={handleSpriteDragEnd}
              >
                <div
                  className="sprite-select-checkbox"
                  onClick={e => toggleSpriteSelection(sprite.id, e)}
                >
                  <Checkbox
                    checked={selectedSpriteIds.has(sprite.id)}
                    readOnly
                  />
                </div>
                <div className="sprite-preview">
                  <img
                    src={getFileUrl(sprite.fileId.toString())}
                    alt={sprite.name}
                    onError={e => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                    }}
                  />
                </div>
                <div className="sprite-info">
                  <h3 className="sprite-name">{sprite.name}</h3>
                  <div className="sprite-meta">
                    <span className="sprite-type">
                      {getSpriteTypeName(sprite.spriteType)}
                    </span>
                  </div>
                  <span className="sprite-size">
                    {formatFileSize(sprite.fileSizeBytes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {isAreaSelecting && selectionBox && (
            <div
              className="selection-box"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
            />
          )}
        </div>
      )}

      {pagination.hasMore && (
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}
        >
          <Button
            label={
              isLoadingMore
                ? 'Loading...'
                : `Load More (${sprites.length} of ${pagination.totalCount})`
            }
            icon={
              isLoadingMore ? 'pi pi-spinner pi-spin' : 'pi pi-chevron-down'
            }
            onClick={() => loadSprites(true)}
            disabled={isLoadingMore}
            className="p-button-outlined"
          />
        </div>
      )}

      <div className="sprite-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop images here</span>
      </div>

      {/* Create/Edit Category Dialog */}
      <Dialog
        header={editingCategory ? 'Rename Category' : 'Add Category'}
        visible={showCategoryDialog}
        onHide={() => setShowCategoryDialog(false)}
        style={{ width: '400px' }}
        data-testid="category-dialog"
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              className="p-button-text"
              onClick={() => {
                setShowCategoryDialog(false)
                if (editingCategory) {
                  resetCategoryForm({
                    name: editingCategory.name,
                    description: editingCategory.description || '',
                  })
                } else {
                  resetCategoryForm({ name: '', description: '' })
                }
              }}
              data-testid="category-dialog-cancel"
            />
            <Button
              label="Save"
              icon="pi pi-check"
              onClick={handleSaveCategory}
              data-testid="category-dialog-save"
            />
          </div>
        }
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="categoryName">Name *</label>
            <InputText
              id="categoryName"
              {...registerCategory('name')}
              autoFocus
              data-testid="category-name-input"
            />
          </div>
          <div className="field">
            <label htmlFor="categoryDescription">Description</label>
            <InputTextarea
              id="categoryDescription"
              {...registerCategory('description')}
              rows={3}
              data-testid="category-description-input"
            />
          </div>
        </div>
      </Dialog>

      {/* Sprite Detail Modal */}
      <Dialog
        header={
          selectedSprite ? (
            <div
              className="sprite-modal-header"
              data-testid="sprite-modal-header"
            >
              {isEditingSpriteName ? (
                <div className="sprite-name-edit">
                  <InputText
                    {...registerSpriteRename('name')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveSpriteName()
                      if (e.key === 'Escape') {
                        setIsEditingSpriteName(false)
                        resetSpriteRenameForm({ name: selectedSprite.name })
                      }
                    }}
                    autoFocus
                    data-testid="sprite-name-input"
                    style={{ width: '300px' }}
                  />
                  <Button
                    icon="pi pi-check"
                    className="p-button-text p-button-rounded"
                    onClick={handleSaveSpriteName}
                    disabled={isSavingSpriteName}
                    tooltip="Save"
                    data-testid="sprite-name-save"
                  />
                  <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-rounded"
                    onClick={() => {
                      setIsEditingSpriteName(false)
                      resetSpriteRenameForm({ name: selectedSprite.name })
                    }}
                    disabled={isSavingSpriteName}
                    tooltip="Cancel"
                    data-testid="sprite-name-cancel"
                  />
                </div>
              ) : (
                <div className="sprite-name-display">
                  <span data-testid="sprite-name-display">
                    {selectedSprite.name}
                  </span>
                  <Button
                    icon="pi pi-pencil"
                    className="p-button-text p-button-rounded"
                    onClick={() => {
                      setIsEditingSpriteName(true)
                      resetSpriteRenameForm({ name: selectedSprite.name })
                    }}
                    tooltip="Edit name"
                    data-testid="sprite-name-edit"
                  />
                </div>
              )}
            </div>
          ) : (
            'Sprite'
          )
        }
        visible={showSpriteModal}
        onHide={() => {
          setShowSpriteModal(false)
          setIsEditingSpriteName(false)
          if (selectedSprite) {
            resetSpriteRenameForm({ name: selectedSprite.name })
          }
        }}
        style={{ width: '600px' }}
        className="sprite-detail-modal"
        data-testid="sprite-detail-modal"
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
                  onClick={handleDownload}
                  className="p-button-success w-full"
                />
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={e => {
          if (e.target.files) {
            handleFileDrop(e.target.files)
          }
        }}
      />
    </div>
  )
}

