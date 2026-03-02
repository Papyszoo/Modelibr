import { create } from 'zustand'

import { client } from '@/lib/apiBase'

interface BlenderEnabledStore {
  blenderEnabled: boolean
  loading: boolean
  fetchBlenderEnabled: () => Promise<void>
}

export const useBlenderEnabledStore = create<BlenderEnabledStore>(set => ({
  blenderEnabled: false,
  loading: true,
  fetchBlenderEnabled: async () => {
    try {
      const response = await client.get<{ enableBlender: boolean }>(
        '/settings/blender-enabled'
      )
      set({ blenderEnabled: response.data.enableBlender, loading: false })
    } catch {
      set({ blenderEnabled: false, loading: false })
    }
  },
}))
