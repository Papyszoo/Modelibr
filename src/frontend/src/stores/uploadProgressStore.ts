import { create } from 'zustand'

export interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  result?: unknown
  error?: Error
  fileType: 'model' | 'texture' | 'file'
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
  addUpload: (file: File, fileType: 'model' | 'texture' | 'file', batchId?: string) => string
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

export const useUploadProgressStore = create<UploadProgressStore>((set, get) => ({
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

  addUpload: (file: File, fileType: 'model' | 'texture' | 'file', batchId?: string) => {
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

  updateUploadProgress: (id: string, progress: number) => {
    set(state => {
      const newUploads = state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, progress, status: 'uploading' as const }
          : upload
      )
      
      // Update batches too
      const newBatches = state.batches.map(batch => ({
        ...batch,
        files: batch.files.map(upload =>
          upload.id === id
            ? { ...upload, progress, status: 'uploading' as const }
            : upload
        ),
      }))

      return {
        uploads: newUploads,
        batches: newBatches,
      }
    })
  },

  completeUpload: (id: string, result?: unknown) => {
    set(state => {
      const newUploads = state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, progress: 100, status: 'completed' as const, result }
          : upload
      )

      const newBatches = state.batches.map(batch => ({
        ...batch,
        files: batch.files.map(upload =>
          upload.id === id
            ? { ...upload, progress: 100, status: 'completed' as const, result }
            : upload
        ),
      }))

      return {
        uploads: newUploads,
        batches: newBatches,
      }
    })
  },

  updateUploadResult: (id: string, result: unknown) => {
    set(state => {
      const newUploads = state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, result: { ...upload.result, ...result } }
          : upload
      )

      const newBatches = state.batches.map(batch => ({
        ...batch,
        files: batch.files.map(upload =>
          upload.id === id
            ? { ...upload, result: { ...upload.result, ...result } }
            : upload
        ),
      }))

      return {
        uploads: newUploads,
        batches: newBatches,
      }
    })
  },

  failUpload: (id: string, error: Error) => {
    set(state => {
      const newUploads = state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, status: 'error' as const, error }
          : upload
      )

      const newBatches = state.batches.map(batch => ({
        ...batch,
        files: batch.files.map(upload =>
          upload.id === id
            ? { ...upload, status: 'error' as const, error }
            : upload
        ),
      }))

      return {
        uploads: newUploads,
        batches: newBatches,
      }
    })
  },

  removeUpload: (id: string) => {
    set(state => {
      const newUploads = state.uploads.filter(upload => upload.id !== id)
      const newBatches = state.batches
        .map(batch => ({
          ...batch,
          files: batch.files.filter(upload => upload.id !== id),
        }))
        .filter(batch => batch.files.length > 0) // Remove empty batches

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
        .map(batch => ({
          ...batch,
          files: batch.files.filter(
            upload => upload.status !== 'completed' && upload.status !== 'error'
          ),
        }))
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
