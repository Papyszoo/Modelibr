import { createContext, ReactNode, useState, useCallback } from 'react'

export interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'completed' | 'error'
  result?: unknown
  error?: Error
  fileType: 'model' | 'texture' | 'file'
}

export interface UploadProgressContextValue {
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

const UploadProgressContext = createContext<
  UploadProgressContextValue | undefined
>(undefined)

export const UploadProgressProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [isVisible, setIsVisible] = useState(false)

  const addUpload = useCallback(
    (file: File, fileType: 'model' | 'texture' | 'file'): string => {
      const id = `upload-${Date.now()}-${Math.random()}`
      const newUpload: UploadItem = {
        id,
        file,
        progress: 0,
        status: 'pending',
        fileType,
      }
      setUploads(prev => [...prev, newUpload])
      setIsVisible(true)
      return id
    },
    []
  )

  const updateUploadProgress = useCallback((id: string, progress: number) => {
    setUploads(prev =>
      prev.map(upload =>
        upload.id === id
          ? { ...upload, progress, status: 'uploading' as const }
          : upload
      )
    )
  }, [])

  const completeUpload = useCallback((id: string, result?: unknown) => {
    setUploads(prev =>
      prev.map(upload =>
        upload.id === id
          ? { ...upload, progress: 100, status: 'completed' as const, result }
          : upload
      )
    )
  }, [])

  const failUpload = useCallback((id: string, error: Error) => {
    setUploads(prev =>
      prev.map(upload =>
        upload.id === id
          ? { ...upload, status: 'error' as const, error }
          : upload
      )
    )
  }, [])

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => prev.filter(upload => upload.id !== id))
  }, [])

  const clearCompleted = useCallback(() => {
    setUploads(prev =>
      prev.filter(
        upload => upload.status !== 'completed' && upload.status !== 'error'
      )
    )
  }, [])

  const showWindow = useCallback(() => {
    setIsVisible(true)
  }, [])

  const hideWindow = useCallback(() => {
    setIsVisible(false)
  }, [])

  const value: UploadProgressContextValue = {
    uploads,
    isVisible,
    addUpload,
    updateUploadProgress,
    completeUpload,
    failUpload,
    removeUpload,
    clearCompleted,
    showWindow,
    hideWindow,
  }

  return (
    <UploadProgressContext.Provider value={value}>
      {children}
    </UploadProgressContext.Provider>
  )
}

export default UploadProgressContext
