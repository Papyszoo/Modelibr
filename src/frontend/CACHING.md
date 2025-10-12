# API Response Caching

This document describes the API response caching implementation in the frontend application.

## Overview

The application implements a client-side caching layer for API responses to improve performance and reduce unnecessary network requests. The cache is built using Zustand for state management and integrates seamlessly with the existing API client.

## Architecture

### Cache Store (`apiCacheStore.ts`)

The cache store manages cached data with the following features:

- **Automatic Expiration**: Cached data expires after a configurable TTL (default: 5 minutes)
- **Granular Invalidation**: Can invalidate specific entries or all cached data
- **Collection & Individual Caching**: Automatically caches both collections and individual items
- **Type-Safe**: Full TypeScript support with proper typing

### Cached Resources

The following API responses are cached:

1. **Models**
   - `getModels()` - All models
   - `getModelById(id)` - Individual models

2. **Texture Sets**
   - `getAllTextureSets()` - All texture sets
   - `getTextureSetById(id)` - Individual texture sets

3. **Packs**
   - `getAllPacks()` - All packs
   - `getPackById(id)` - Individual packs

## Usage

### Basic Usage

The caching is transparent - no code changes are required in most cases:

```typescript
// This will use cached data if available and fresh
const models = await ApiClient.getModels()

// This will bypass the cache and fetch fresh data
const models = await ApiClient.getModels({ skipCache: true })
```

### Manual Cache Refresh

Use the `useApiCache` hook to manually refresh cached data:

```typescript
import { useApiCache } from '../hooks/useApiCache'

function MyComponent() {
  const { refreshModels, refreshAll } = useApiCache()
  
  const handleRefresh = () => {
    refreshModels() // Invalidate and refetch models
  }
  
  const handleRefreshAll = () => {
    refreshAll() // Invalidate and refetch all cached data
  }
}
```

### Direct Cache Store Access

For advanced use cases, you can directly access the cache store:

```typescript
import { useApiCacheStore } from '../stores/apiCacheStore'

function MyComponent() {
  const store = useApiCacheStore()
  
  // Invalidate specific cache
  store.invalidateModels()
  
  // Get cached data directly
  const models = store.getModels()
  
  // Set custom TTL (in milliseconds)
  store.defaultTTL = 10 * 60 * 1000 // 10 minutes
}
```

## Cache Invalidation Strategy

The cache is automatically invalidated when data is modified:

### Mutations that Invalidate Cache

1. **Model Operations**
   - `uploadModel()` → Invalidates models cache
   - Model associations → Invalidates both models and related caches

2. **Texture Set Operations**
   - `createTextureSet()` → Invalidates texture sets cache
   - `updateTextureSet()` → Invalidates texture sets cache + specific set
   - `deleteTextureSet()` → Invalidates texture sets cache + specific set
   - `addTextureToSet()` → Invalidates texture sets cache + specific set
   - `removeTextureFromSet()` → Invalidates texture sets cache + specific set

3. **Pack Operations**
   - `createPack()` → Invalidates packs cache
   - `updatePack()` → Invalidates packs cache + specific pack
   - `deletePack()` → Invalidates packs cache + specific pack
   - Pack associations → Invalidates related caches

### Cross-Resource Invalidation

When resources are associated, multiple caches are invalidated:

```typescript
// Adding a model to a pack invalidates:
// - Packs cache
// - Specific pack cache
// - Models cache
// - Specific model cache
await ApiClient.addModelToPack(packId, modelId)
```

## SignalR Integration (Future)

The caching system is designed to work with SignalR for real-time cache invalidation:

```typescript
import { useSignalRCacheInvalidation } from '../hooks/useApiCache'

function App() {
  const connection = useSignalRConnection() // Your SignalR connection
  
  // Automatically invalidate cache on SignalR events
  useSignalRCacheInvalidation(connection)
}
```

### Supported SignalR Events

The following SignalR events will trigger cache invalidation:

- `ModelCreated`, `ModelUpdated`, `ModelDeleted`
- `TextureSetCreated`, `TextureSetUpdated`, `TextureSetDeleted`
- `PackCreated`, `PackUpdated`, `PackDeleted`

## Performance Considerations

### Cache TTL

The default TTL is 5 minutes. This can be adjusted based on:

- **Data volatility**: How often the data changes
- **User workflow**: How long users typically work with the same data
- **Memory constraints**: Longer TTLs use more memory

### Memory Usage

The cache stores data in memory. For large datasets:

1. Individual item caches are separate from collection caches
2. Stale data is automatically excluded from getters
3. `invalidateAll()` clears all cached data

### Network Reduction

Cache hit scenarios:

1. **Page Refresh**: Previously loaded data is cached (within TTL)
2. **Tab Switching**: Switching between tabs uses cached data
3. **Component Re-renders**: React re-renders don't trigger new API calls

## Testing

The cache store has comprehensive unit tests in `apiCacheStore.test.ts`:

```bash
npm test -- apiCacheStore.test.ts
```

Test coverage includes:

- Cache storage and retrieval
- TTL expiration
- Invalidation (individual and global)
- Auto-caching of individual items from collections

## Best Practices

1. **Use Default Caching**: Don't bypass cache unless necessary
2. **Invalidate on Mutations**: The API client handles this automatically
3. **Refresh on User Action**: Use `useApiCache` hook for user-triggered refreshes
4. **Monitor TTL**: Adjust TTL based on your use case
5. **SignalR Integration**: Plan to use SignalR events for real-time invalidation

## Example: Refresh Button

```typescript
import { useApiCache } from '../hooks/useApiCache'

function ModelList() {
  const { refreshModels } = useApiCache()
  const [models, setModels] = useState<Model[]>([])
  
  useEffect(() => {
    // Initial load - uses cache if available
    ApiClient.getModels().then(setModels)
  }, [])
  
  const handleRefresh = async () => {
    refreshModels() // Invalidates cache
    const freshModels = await ApiClient.getModels() // Fetches fresh data
    setModels(freshModels)
  }
  
  return (
    <div>
      <button onClick={handleRefresh}>Refresh</button>
      {/* Render models */}
    </div>
  )
}
```

## Troubleshooting

### Cache Not Working

1. Check if `skipCache: true` is being used
2. Verify TTL hasn't expired
3. Check if data was invalidated by a mutation

### Stale Data

1. Reduce TTL for more frequent updates
2. Use `skipCache: true` for critical reads
3. Implement SignalR for real-time invalidation

### Memory Issues

1. Call `invalidateAll()` periodically
2. Reduce TTL to allow garbage collection
3. Monitor cache store size in dev tools
