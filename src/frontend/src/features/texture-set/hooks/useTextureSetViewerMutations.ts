import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ToastMessage } from 'primereact/toast'
import { useState } from 'react'

import {
  regenerateTextureSetThumbnail,
  updateTextureSet,
  updateTextureSetTags,
} from '@/features/texture-set/api/textureSetApi'
import type { TextureSetDto } from '@/types'

interface UseTextureSetViewerMutationsParams {
  textureSet: TextureSetDto | null
  refreshTextureSet: () => Promise<void>
  showToast: (message: ToastMessage) => void
}

export function useTextureSetViewerMutations({
  textureSet,
  refreshTextureSet,
  showToast,
}: UseTextureSetViewerMutationsParams) {
  const queryClient = useQueryClient()
  const [updating, setUpdating] = useState(false)

  const updateTextureSetMutation = useMutation({
    mutationFn: (newName: string) => {
      if (!textureSet) {
        throw new Error('Texture set not found')
      }
      return updateTextureSet(textureSet.id, { name: newName })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
    },
  })

  const generateProxyMutation = useMutation({
    mutationFn: (proxySize: number) =>
      regenerateTextureSetThumbnail(textureSet!.id, { proxySize }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
      showToast({
        severity: 'success',
        summary: 'Generating',
        detail: 'Proxy generation queued',
        life: 3000,
      })
    },
  })

  const updateTagsMutation = useMutation({
    mutationFn: (tags: string[]) => {
      if (!textureSet) {
        throw new Error('Texture set not found')
      }
      return updateTextureSetTags(textureSet.id, tags)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['textureSets'] })
      // The tag vocabulary may have gained a brand-new tag.
      queryClient.invalidateQueries({ queryKey: ['tag-vocabulary'] })
    },
  })

  const handleUpdateName = async (newName: string) => {
    if (!textureSet) return

    try {
      setUpdating(true)
      await updateTextureSetMutation.mutateAsync(newName)
      await refreshTextureSet()
    } catch (error) {
      console.error('Failed to update texture set:', error)
      throw error
    } finally {
      setUpdating(false)
    }
  }

  const handleUpdateTags = async (tags: string[]) => {
    if (!textureSet) return

    try {
      await updateTagsMutation.mutateAsync(tags)
      await refreshTextureSet()
    } catch (error) {
      console.error('Failed to update texture set tags:', error)
      throw error
    }
  }

  return {
    handleUpdateName,
    handleUpdateTags,
    updating,
    generateProxy: generateProxyMutation.mutate,
    isGeneratingProxy: generateProxyMutation.isPending,
  }
}
