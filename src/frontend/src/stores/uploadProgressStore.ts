import { create } from 'zustand'

export type UploadFileType =
  | 'model'
  | 'texture'
  | 'file'
  | 'sprite'
  | 'sound'
  | 'environmentMap'

export interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  result?: unknown
  error?: Error
  fileType: UploadFileType
  batchId?: string // ID of the batch this upload belongs to
}

export interface UploadBatch {
  id: string
  timestamp: number
  files: UploadItem[]
  collapsed: boolean
}

interface UploadProgressStore {
  uploads: UploadItem[]
  batches: UploadBatch[]
  isVisible: boolean
  addUpload: (file: File, fileType: UploadFileType, batchId?: string) => string
  addUploads: (
    files: File[],
    fileType: UploadFileType,
    batchId?: string
  ) => string[]
  updateUploadProgress: (id: string, progress: number) => void
  completeUpload: (id: string, result?: unknown) => void
  updateUploadResult: (id: string, result: unknown) => void
  failUpload: (id: string, error: Error) => void
  removeUpload: (id: string) => void
  clearCompleted: () => void
  showWindow: () => void
  hideWindow: () => void
  toggleBatchCollapse: (batchId: string) => void
  createBatch: () => string
}

// Apply a per-item update to both the flat uploads array and the matching
// batch's nested files array. Only the affected batch is cloned — other
// batches keep their previous reference, which avoids O(N²) work when many
// items progress in parallel.
function applyItemUpdate(
  state: { uploads: UploadItem[]; batches: UploadBatch[] },
  id: string,
  updater: (item: UploadItem) => UploadItem
): { uploads: UploadItem[]; batches: UploadBatch[] } {
  let uploadsChanged = false
  const newUploads = state.uploads.map(upload => {
    if (upload.id !== id) return upload
    uploadsChanged = true
    return updater(upload)
  })

  let batchesChanged = false
  const newBatches = state.batches.map(batch => {
    let fileFound = false
    const newFiles = batch.files.map(upload => {
      if (upload.id !== id) return upload
      fileFound = true
      return updater(upload)
    })
    if (!fileFound) return batch
    batchesChanged = true
    return { ...batch, files: newFiles }
  })

  return {
    uploads: uploadsChanged ? newUploads : state.uploads,
    batches: batchesChanged ? newBatches : state.batches,
  }
}

export const useUploadProgressStore = create<UploadProgressStore>(set => ({
  uploads: [],
  batches: [],
  isVisible: false,

  createBatch: () => {
    const batchId = `batch-${Date.now()}-${Math.random()}`
    set(state => ({
      batches: [
        ...state.batches,
        { id: batchId, timestamp: Date.now(), files: [], collapsed: false },
      ],
    }))
    return batchId
  },

  addUpload: (file, fileType, batchId) => {
    const id = `upload-${Date.now()}-${Math.random()}`
    const newUpload: UploadItem = {
      id,
      file,
      progress: 0,
      status: 'pending',
      fileType,
      batchId,
    }
    set(state => {
      const newUploads = [...state.uploads, newUpload]
      const newBatches = batchId
        ? state.batches.map(batch =>
            batch.id === batchId
              ? { ...batch, files: [...batch.files, newUpload] }
              : batch
          )
        : state.batches

      return {
        uploads: newUploads,
        batches: newBatches,
        isVisible: true,
      }
    })
    return id
  },

  addUploads: (files, fileType, batchId) => {
    if (files.length === 0) return []
    const ids: string[] = []
    const newItems: UploadItem[] = files.map((file, index) => {
      const id = `upload-${Date.now()}-${index}-${Math.random()}`
      ids.push(id)
      return {
        id,
        file,
        progress: 0,
        status: 'pending',
        fileType,
        batchId,
      }
    })
    set(state => {
      const newUploads = state.uploads.concat(newItems)
      const newBatches = batchId
        ? state.batches.map(batch =>
            batch.id === batchId
              ? { ...batch, files: batch.files.concat(newItems) }
              : batch
          )
        : state.batches
      return {
        uploads: newUploads,
        batches: newBatches,
        isVisible: true,
      }
    })
    return ids
  },

  updateUploadProgress: (id, progress) => {
    set(state =>
      applyItemUpdate(state, id, upload => ({
        ...upload,
        progress,
        status: 'uploading' as const,
      }))
    )
  },

  completeUpload: (id, result) => {
    set(state =>
      applyItemUpdate(state, id, upload => ({
        ...upload,
        progress: 100,
        status: 'completed' as const,
        result,
      }))
    )
  },

  updateUploadResult: (id, result) => {
    set(state =>
      applyItemUpdate(state, id, upload => ({
        ...upload,
        result: { ...(upload.result as object), ...(result as object) },
      }))
    )
  },

  failUpload: (id, error) => {
    set(state =>
      applyItemUpdate(state, id, upload => ({
        ...upload,
        status: 'error' as const,
        error,
      }))
    )
  },

  removeUpload: (id: string) => {
    set(state => {
      const newUploads = state.uploads.filter(upload => upload.id !== id)
      const newBatches = state.batches
        .map(batch => {
          const idx = batch.files.findIndex(upload => upload.id === id)
          if (idx === -1) return batch
          const newFiles = batch.files.slice()
          newFiles.splice(idx, 1)
          return { ...batch, files: newFiles }
        })
        .filter(batch => batch.files.length > 0)

      return {
        uploads: newUploads,
        batches: newBatches,
      }
    })
  },

  clearCompleted: () => {
    set(state => {
      const newUploads = state.uploads.filter(
        upload => upload.status !== 'completed' && upload.status !== 'error'
      )

      const newBatches = state.batches
        .map(batch => {
          const hasFinished = batch.files.some(
            upload =>
              upload.status === 'completed' || upload.status === 'error'
          )
          if (!hasFinished) return batch
          const newFiles = batch.files.filter(
            upload =>
              upload.status !== 'completed' && upload.status !== 'error'
          )
          return { ...batch, files: newFiles }
        })
        .filter(batch => batch.files.length > 0)

      return {
        uploads: newUploads,
        batches: newBatches,
      }
    })
  },

  showWindow: () => {
    set({ isVisible: true })
  },

  hideWindow: () => {
    set({ isVisible: false })
  },

  toggleBatchCollapse: (batchId: string) => {
    set(state => ({
      batches: state.batches.map(batch =>
        batch.id === batchId ? { ...batch, collapsed: !batch.collapsed } : batch
      ),
    }))
  },
}))
