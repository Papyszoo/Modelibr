import './TextureSetList.css'

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef, useState } from 'react'

import { getTextureSetsPaginated } from '@/features/texture-set/api/textureSetApi'
import {
  createTextureSet,
  createTextureSetWithFile,
  deleteTextureSet,
  updateTextureSetKind,
} from '@/features/texture-set/api/textureSetApi'
import { CreateTextureSetDialog } from '@/features/texture-set/dialogs/CreateTextureSetDialog'
import { useTabContext } from '@/hooks/useTabContext'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { type TextureSetDto, TextureSetKind } from '@/types'

import { TextureSetGrid } from './TextureSetGrid'
import { TextureSetListHeader } from './TextureSetListHeader'

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
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [kindFilter, setKindFilter] = useState<KindFilter>('universal')
  const [dragOverTab, setDragOverTab] = useState<KindFilter | null>(null)
  const toast = useRef<Toast>(null)
  const { openTextureSetDetailsTab } = useTabContext()
  const uploadProgressContext = useUploadProgress()
  const queryClient = useQueryClient()

  const PAGE_SIZE = 50

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['textureSets', { kind: kindFilterToApiKind(kindFilter) }],
    queryFn: ({ pageParam }) =>
      getTextureSetsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        kind: kindFilterToApiKind(kindFilter),
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.textureSets.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const textureSets = paginatedData?.pages.flatMap(p => p.textureSets) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0
  const loading = isLoading

  const invalidateTextureSets = () => {
    queryClient.invalidateQueries({ queryKey: ['textureSets'] })
  }

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
      invalidateTextureSets()
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
      invalidateTextureSets()
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

  const handleTextureSetRecycled = (_textureSetId: number) => {
    invalidateTextureSets()
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
    invalidateTextureSets()
  }

  // Use drag and drop hook
  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  return (
    <div className="texture-set-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <TextureSetListHeader
        setCount={totalCount || textureSets.length}
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
                  invalidateTextureSets()
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
        onTextureSetUpdated={invalidateTextureSets}
      />

      {hasNextPage && (
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}
        >
          <Button
            label={
              isFetchingNextPage
                ? 'Loading...'
                : `Load More (${textureSets.length} of ${totalCount})`
            }
            icon={
              isFetchingNextPage
                ? 'pi pi-spinner pi-spin'
                : 'pi pi-chevron-down'
            }
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
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
