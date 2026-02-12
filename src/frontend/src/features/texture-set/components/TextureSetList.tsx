import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { TextureSetDto, PaginationState } from '@/types'
import { useTabContext } from '@/hooks/useTabContext'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import {
  createTextureSet,
  createTextureSetWithFile,
  deleteTextureSet,
} from '@/features/texture-set/api/textureSetApi'
import {
  getTextureSetsQueryOptions,
  useTextureSetsQuery,
} from '@/features/texture-set/api/queries'
import { Button } from 'primereact/button'
import CreateTextureSetDialog from '@/features/texture-set/dialogs/CreateTextureSetDialog'
import TextureSetListHeader from './TextureSetListHeader'
import TextureSetGrid from './TextureSetGrid'
import './TextureSetList.css'

function TextureSetList() {
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
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
    params: { page: 1, pageSize: 50 },
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
          getTextureSetsQueryOptions({ page, pageSize: 50 })
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
    [pagination.page, queryClient]
  )

  const createTextureSetMutation = useMutation({
    mutationFn: async (name: string) => {
      await createTextureSet({ name })
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

  const handleCreateTextureSet = async (name: string) => {
    await createTextureSetMutation.mutateAsync(name)
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
        const result = await createTextureSetWithFile(file, {
          name: fileName,
          textureType: 'Albedo',
          batchId,
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

export default TextureSetList
