import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { TextureSetDto, PaginationState, TextureSetKind } from '@/types'
import { useTabContext } from '@/hooks/useTabContext'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import {
  createTextureSet,
  createTextureSetWithFile,
  deleteTextureSet,
  updateTextureSetKind,
} from '@/features/texture-set/api/textureSetApi'
import {
  getTextureSetsQueryOptions,
  useTextureSetsQuery,
} from '@/features/texture-set/api/queries'
import { Button } from 'primereact/button'
import { CreateTextureSetDialog } from '@/features/texture-set/dialogs/CreateTextureSetDialog'
import { TextureSetListHeader } from './TextureSetListHeader'
import { TextureSetGrid } from './TextureSetGrid'
import './TextureSetList.css'

type KindFilter = 'model-specific' | 'universal'

const kindFilterOptions: { label: string; value: KindFilter; kind: number }[] =
  [
    {
      label: 'Model-Specific',
      value: 'model-specific',
      kind: TextureSetKind.ModelSpecific,
    },
    {
      label: 'Global Materials',
      value: 'universal',
      kind: TextureSetKind.Universal,
    },
  ]

function kindFilterToApiKind(filter: KindFilter): number {
  switch (filter) {
    case 'model-specific':
      return TextureSetKind.ModelSpecific
    case 'universal':
      return TextureSetKind.Universal
  }
}

export function TextureSetList() {
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [kindFilter, setKindFilter] = useState<KindFilter>('universal')
  const [dragOverTab, setDragOverTab] = useState<KindFilter | null>(null)
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
    hasMore: false,
  })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const toast = useRef<Toast>(null)
  const { openTextureSetDetailsTab } = useTabContext()
  const uploadProgressContext = useUploadProgress()
  const queryClient = useQueryClient()
  const textureSetsQuery = useTextureSetsQuery({
    params: { page: 1, pageSize: 50, kind: kindFilterToApiKind(kindFilter) },
  })

  const loading = textureSetsQuery.isLoading && textureSets.length === 0

  useEffect(() => {
    if (!textureSetsQuery.data) return

    setTextureSets(textureSetsQuery.data.textureSets || [])
    setPagination({
      page: 1,
      pageSize: textureSetsQuery.data.pageSize,
      totalCount: textureSetsQuery.data.totalCount,
      totalPages: textureSetsQuery.data.totalPages,
      hasMore: 1 < textureSetsQuery.data.totalPages,
    })
  }, [textureSetsQuery.data])

  useEffect(() => {
    if (!textureSetsQuery.error) return

    console.error('Failed to load texture sets:', textureSetsQuery.error)
    setTextureSets([])
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load texture sets',
      life: 3000,
    })
  }, [textureSetsQuery.error])

  const loadTextureSets = useCallback(
    async (loadMore = false) => {
      if (!loadMore) {
        await queryClient.invalidateQueries({ queryKey: ['textureSets'] })
        return
      }

      try {
        setIsLoadingMore(true)
        const page = pagination.page + 1
        const result = await queryClient.fetchQuery(
          getTextureSetsQueryOptions({
            page,
            pageSize: 50,
            kind: kindFilterToApiKind(kindFilter),
          })
        )

        setTextureSets(prev => [...prev, ...(result.textureSets || [])])
        setPagination({
          page,
          pageSize: result.pageSize,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          hasMore: page < result.totalPages,
        })
      } catch (error) {
        console.error('Failed to load texture sets:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load texture sets',
          life: 3000,
        })
      } finally {
        setIsLoadingMore(false)
      }
    },
    [pagination.page, queryClient, kindFilter]
  )

  const createTextureSetMutation = useMutation({
    mutationFn: async ({ name, kind }: { name: string; kind: number }) => {
      await createTextureSet({ name, kind })
    },
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set created successfully',
        life: 3000,
      })
      await loadTextureSets()
      setShowCreateDialog(false)
    },
    onError: error => {
      console.error('Failed to create texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create texture set',
        life: 3000,
      })
    },
  })

  const deleteTextureSetMutation = useMutation({
    mutationFn: async (textureSetId: number) => {
      await deleteTextureSet(textureSetId)
    },
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set deleted successfully',
        life: 3000,
      })
      await loadTextureSets()
    },
    onError: error => {
      console.error('Failed to delete texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete texture set',
        life: 3000,
      })
    },
  })

  const handleCreateTextureSet = async (name: string, kind: number = 0) => {
    await createTextureSetMutation.mutateAsync({ name, kind })
  }

  const _handleDeleteTextureSet = (textureSet: TextureSetDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the texture set "${textureSet.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        await deleteTextureSetMutation.mutateAsync(textureSet.id)
      },
    })
  }

  const handleViewDetails = (textureSet: TextureSetDto) => {
    openTextureSetDetailsTab(textureSet.id, textureSet.name)
  }

  const handleTextureSetRecycled = (textureSetId: number) => {
    // Remove the recycled texture set from the list without making a new request
    setTextureSets(prevSets => prevSets.filter(ts => ts.id !== textureSetId))
  }

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    // Create batch for all files (even single file uploads)
    const batchId = uploadProgressContext?.createBatch() || undefined

    for (const file of fileArray) {
      let uploadId: string | null = null
      try {
        // 1. Track the upload and get its ID
        uploadId =
          uploadProgressContext?.addUpload(file, 'texture', batchId) || null

        // 2. Update progress
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        // 3. Use the new consolidated endpoint that handles file upload + texture set creation + texture addition
        const fileName = file.name.replace(/\.[^/.]+$/, '')
        // Inherit the kind from the current filter tab (Global Materials → Universal, Model-Specific → ModelSpecific)
        const dropKind = kindFilterToApiKind(kindFilter)
        const result = await createTextureSetWithFile(file, {
          name: fileName,
          textureType: 'Albedo',
          batchId,
          kind: dropKind,
        })

        // 4. Complete the upload with texture set ID
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            textureSetId: result.textureSetId,
          })
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Texture set "${fileName}" created with albedo texture`,
          life: 3000,
        })
      } catch (error) {
        // Mark upload as failed
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create texture set from file:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create texture set from ${file.name}`,
          life: 3000,
        })
      }
    }

    // Refresh the texture sets list
    loadTextureSets()
  }

  // Use drag and drop hook
  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  return (
    <div className="texture-set-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <TextureSetListHeader
        setCount={pagination.totalCount || textureSets.length}
        onCreateSet={() => setShowCreateDialog(true)}
        onFilesSelected={files => handleFileDrop(files)}
      />

      <div className="kind-filter-bar">
        <div className="kind-filter-select p-selectbutton p-component">
          {kindFilterOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={
                'p-button p-component' +
                (kindFilter === opt.value ? ' p-highlight' : '') +
                (dragOverTab === opt.value && kindFilter !== opt.value
                  ? ' p-button-outlined kind-drop-target'
                  : '')
              }
              onClick={() => {
                if (kindFilter === opt.value) return
                setKindFilter(opt.value)
                setTextureSets([])
              }}
              onDragOver={e => {
                if (
                  e.dataTransfer.types.includes('application/x-texture-set-id')
                ) {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragOverTab(opt.value)
                }
              }}
              onDragLeave={() => setDragOverTab(null)}
              onDrop={async e => {
                e.preventDefault()
                e.stopPropagation()
                setDragOverTab(null)
                const textureSetId = e.dataTransfer.getData(
                  'application/x-texture-set-id'
                )
                if (!textureSetId) return
                // Only change kind when dropping on a different tab
                if (opt.value === kindFilter) return
                try {
                  await updateTextureSetKind(Number(textureSetId), opt.kind)
                  toast.current?.show({
                    severity: 'success',
                    summary: 'Kind Changed',
                    detail: `Texture set moved to ${opt.label}`,
                    life: 3000,
                  })
                  await loadTextureSets()
                } catch (error) {
                  console.error('Failed to change texture set kind:', error)
                  toast.current?.show({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to change texture set kind',
                    life: 3000,
                  })
                }
              }}
            >
              <span className="p-button-label">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <TextureSetGrid
        textureSets={textureSets}
        loading={loading}
        onTextureSetSelect={handleViewDetails}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onTextureSetRecycled={handleTextureSetRecycled}
        onTextureSetUpdated={loadTextureSets}
      />

      {pagination.hasMore && (
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}
        >
          <Button
            label={
              isLoadingMore
                ? 'Loading...'
                : `Load More (${textureSets.length} of ${pagination.totalCount})`
            }
            icon={
              isLoadingMore ? 'pi pi-spinner pi-spin' : 'pi pi-chevron-down'
            }
            onClick={() => loadTextureSets(true)}
            disabled={isLoadingMore}
            className="p-button-outlined"
          />
        </div>
      )}

      {showCreateDialog && (
        <CreateTextureSetDialog
          visible={showCreateDialog}
          onHide={() => setShowCreateDialog(false)}
          onSubmit={handleCreateTextureSet}
        />
      )}
    </div>
  )
}
