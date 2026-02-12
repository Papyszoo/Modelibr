import { useUploadProgressStore } from '@/stores/uploadProgressStore'

export const useUploadProgress = () => {
  return useUploadProgressStore()
}
