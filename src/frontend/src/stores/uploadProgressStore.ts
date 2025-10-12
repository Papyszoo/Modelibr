import { create } from 'zustand'

export interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  result?: unknown
  error?: Error
  fileType: 'model' | 'texture' | 'file'
}

interface UploadProgressStore {
  uploads: UploadItem[]
  isVisible: boolean
  addUpload: (file: File, fileType: 'model' | 'texture' | 'file') => string
  updateUploadProgress: (id: string, progress: number) => void
  completeUpload: (id: string, result?: unknown) => void
  failUpload: (id: string, error: Error) => void
  removeUpload: (id: string) => void
  clearCompleted: () => void
  showWindow: () => void
  hideWindow: () => void
}

export const useUploadProgressStore = create<UploadProgressStore>(set => ({
  uploads: [],
  isVisible: false,

  addUpload: (file: File, fileType: 'model' | 'texture' | 'file') => {
    const id = `upload-${Date.now()}-${Math.random()}`
    const newUpload: UploadItem = {
      id,
      file,
      progress: 0,
      status: 'pending',
      fileType,
    }
    set(state => ({
      uploads: [...state.uploads, newUpload],
      isVisible: true,
    }))
    return id
  },

  updateUploadProgress: (id: string, progress: number) => {
    set(state => ({
      uploads: state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, progress, status: 'uploading' as const }
          : upload
      ),
    }))
  },

  completeUpload: (id: string, result?: unknown) => {
    set(state => ({
      uploads: state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, progress: 100, status: 'completed' as const, result }
          : upload
      ),
    }))
  },

  failUpload: (id: string, error: Error) => {
    set(state => ({
      uploads: state.uploads.map(upload =>
        upload.id === id
          ? { ...upload, status: 'error' as const, error }
          : upload
      ),
    }))
  },

  removeUpload: (id: string) => {
    set(state => ({
      uploads: state.uploads.filter(upload => upload.id !== id),
    }))
  },

  clearCompleted: () => {
    set(state => ({
      uploads: state.uploads.filter(
        upload => upload.status !== 'completed' && upload.status !== 'error'
      ),
    }))
  },

  showWindow: () => {
    set({ isVisible: true })
  },

  hideWindow: () => {
    set({ isVisible: false })
  },
}))
