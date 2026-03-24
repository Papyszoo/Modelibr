import { create } from 'zustand'

import { client } from '@/lib/apiBase'

interface BlenderEnabledStore {
  blenderEnabled: boolean
  blenderPath: string
  settingEnabled: boolean
  installed: boolean
  installedVersion: string | null
  loading: boolean
  fetchBlenderEnabled: () => Promise<void>
}

export const useBlenderEnabledStore = create<BlenderEnabledStore>(set => ({
  blenderEnabled: false,
  blenderPath: 'blender',
  settingEnabled: false,
  installed: false,
  installedVersion: null,
  loading: true,
  fetchBlenderEnabled: async () => {
    try {
      const response = await client.get<{
        enableBlender: boolean
        blenderPath: string
        settingEnabled: boolean
        installed: boolean
        installedVersion: string | null
      }>('/settings/blender-enabled')
      set({
        blenderEnabled: response.data.enableBlender,
        blenderPath: response.data.blenderPath ?? 'blender',
        settingEnabled: response.data.settingEnabled ?? false,
        installed: response.data.installed ?? false,
        installedVersion: response.data.installedVersion ?? null,
        loading: false,
      })
    } catch {
      set({
        blenderEnabled: false,
        blenderPath: 'blender',
        settingEnabled: false,
        installed: false,
        installedVersion: null,
        loading: false,
      })
    }
  },
}))
