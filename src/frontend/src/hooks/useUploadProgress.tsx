import { useContext } from 'react'
import UploadProgressContext, {
  UploadProgressContextValue,
} from '../contexts/UploadProgressContext'

export const useUploadProgress = (): UploadProgressContextValue => {
  const context = useContext(UploadProgressContext)
  if (!context) {
    throw new Error(
      'useUploadProgress must be used within an UploadProgressProvider'
    )
  }
  return context
}
