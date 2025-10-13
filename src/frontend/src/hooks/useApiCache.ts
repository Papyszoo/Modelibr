import { useEffect } from 'react'
import { useApiCacheStore } from '../stores/apiCacheStore'
import ApiClient from '../services/ApiClient'

/**
 * Hook to provide cache refresh utilities.
 * Can be used to manually refresh cached data or integrate with SignalR for real-time updates.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { refreshModels, refreshAll } = useApiCache()
 *
 *   // Manually refresh models when needed
 *   const handleRefresh = () => {
 *     refreshModels()
 *   }
 *
 *   // Or refresh everything
 *   const handleRefreshAll = () => {
 *     refreshAll()
 *   }
 * }
 * ```
 */
export function useApiCache() {
  const store = useApiCacheStore()

  const refreshModels = () => {
    store.invalidateModels()
    // Optionally trigger a background fetch
    ApiClient.getModels({ skipCache: true }).catch(console.error)
  }

  const refreshTextureSets = () => {
    store.invalidateTextureSets()
    // Optionally trigger a background fetch
    ApiClient.getAllTextureSets({ skipCache: true }).catch(console.error)
  }

  const refreshPacks = () => {
    store.invalidatePacks()
    // Optionally trigger a background fetch
    ApiClient.getAllPacks({ skipCache: true }).catch(console.error)
  }

  const refreshThumbnails = () => {
    store.invalidateThumbnails()
  }

  const refreshAll = () => {
    store.invalidateAll()
    // Optionally trigger background fetches for all
    ApiClient.getModels({ skipCache: true }).catch(console.error)
    ApiClient.getAllTextureSets({ skipCache: true }).catch(console.error)
    ApiClient.getAllPacks({ skipCache: true }).catch(console.error)
  }

  return {
    refreshModels,
    refreshTextureSets,
    refreshPacks,
    refreshThumbnails,
    refreshAll,
  }
}

/**
 * Hook to integrate cache invalidation with SignalR events.
 * This allows the cache to be automatically invalidated when SignalR messages indicate data changes.
 *
 * @param connection - SignalR connection instance (optional)
 *
 * @example
 * ```tsx
 * function App() {
 *   const [connection] = useState(() =>
 *     new HubConnectionBuilder()
 *       .withUrl('/hub')
 *       .build()
 *   )
 *
 *   useSignalRCacheInvalidation(connection)
 *
 *   // Cache will automatically be invalidated when SignalR events are received
 * }
 * ```
 */
export function useSignalRCacheInvalidation(connection?: {
  on: (methodName: string, callback: (...args: unknown[]) => void) => void
  off: (methodName: string, callback?: (...args: unknown[]) => void) => void
}) {
  const store = useApiCacheStore()

  useEffect(() => {
    if (!connection) return

    // Model-related events
    const handleModelCreated = () => {
      store.invalidateModels()
    }

    const handleModelUpdated = (modelId: number) => {
      store.invalidateModels()
      store.invalidateModelById(modelId.toString())
    }

    const handleModelDeleted = () => {
      store.invalidateModels()
    }

    // TextureSet-related events
    const handleTextureSetCreated = () => {
      store.invalidateTextureSets()
    }

    const handleTextureSetUpdated = (setId: number) => {
      store.invalidateTextureSets()
      store.invalidateTextureSetById(setId)
    }

    const handleTextureSetDeleted = () => {
      store.invalidateTextureSets()
    }

    // Pack-related events
    const handlePackCreated = () => {
      store.invalidatePacks()
    }

    const handlePackUpdated = (packId: number) => {
      store.invalidatePacks()
      store.invalidatePackById(packId)
    }

    const handlePackDeleted = () => {
      store.invalidatePacks()
    }

    // Register event handlers
    connection.on('ModelCreated', handleModelCreated)
    connection.on('ModelUpdated', handleModelUpdated)
    connection.on('ModelDeleted', handleModelDeleted)
    connection.on('TextureSetCreated', handleTextureSetCreated)
    connection.on('TextureSetUpdated', handleTextureSetUpdated)
    connection.on('TextureSetDeleted', handleTextureSetDeleted)
    connection.on('PackCreated', handlePackCreated)
    connection.on('PackUpdated', handlePackUpdated)
    connection.on('PackDeleted', handlePackDeleted)

    // Cleanup
    return () => {
      connection.off('ModelCreated', handleModelCreated)
      connection.off('ModelUpdated', handleModelUpdated)
      connection.off('ModelDeleted', handleModelDeleted)
      connection.off('TextureSetCreated', handleTextureSetCreated)
      connection.off('TextureSetUpdated', handleTextureSetUpdated)
      connection.off('TextureSetDeleted', handleTextureSetDeleted)
      connection.off('PackCreated', handlePackCreated)
      connection.off('PackUpdated', handlePackUpdated)
      connection.off('PackDeleted', handlePackDeleted)
    }
  }, [connection, store])
}
