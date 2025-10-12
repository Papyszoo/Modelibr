# Cache Usage Examples

This file provides practical examples of how to use the API response caching in your components.

## Example 1: Basic Usage (Automatic Caching)

The caching works automatically for all API GET requests. No code changes needed:

```tsx
import ApiClient from '../services/ApiClient'

function ModelList() {
  const [models, setModels] = useState<Model[]>([])
  
  useEffect(() => {
    // First call: fetches from API and caches
    // Subsequent calls (within 5 min): returns cached data
    ApiClient.getModels().then(setModels)
  }, [])
  
  return <div>{/* render models */}</div>
}
```

## Example 2: Bypassing Cache for Fresh Data

Sometimes you need fresh data regardless of cache:

```tsx
function ModelList() {
  const [models, setModels] = useState<Model[]>([])
  
  const fetchFreshData = async () => {
    // Always fetch fresh data, bypassing cache
    const freshModels = await ApiClient.getModels({ skipCache: true })
    setModels(freshModels)
  }
  
  return (
    <div>
      <button onClick={fetchFreshData}>Fetch Fresh</button>
      {/* render models */}
    </div>
  )
}
```

## Example 3: Manual Cache Refresh

Use the `useApiCache` hook to invalidate and refresh cache:

```tsx
import { useApiCache } from '../hooks/useApiCache'

function ModelList() {
  const { refreshModels } = useApiCache()
  const [models, setModels] = useState<Model[]>([])
  
  const handleRefresh = async () => {
    refreshModels() // Invalidates cache
    const freshModels = await ApiClient.getModels() // Fetches fresh
    setModels(freshModels)
  }
  
  return (
    <div>
      <button onClick={handleRefresh}>Refresh</button>
      {/* render models */}
    </div>
  )
}
```

## Example 4: Working with Individual Items

Individual items are cached separately:

```tsx
function ModelViewer({ modelId }: { modelId: string }) {
  const [model, setModel] = useState<Model | null>(null)
  
  useEffect(() => {
    // Uses cached model if available
    ApiClient.getModelById(modelId).then(setModel)
  }, [modelId])
  
  return <div>{/* render model */}</div>
}
```

## Example 5: Cache-Aware Data Fetching

Combine cache with loading states:

```tsx
function ModelList() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const store = useApiCacheStore()
  
  useEffect(() => {
    // Check cache first
    const cached = store.getModels()
    if (cached) {
      setModels(cached)
      setLoading(false)
      return
    }
    
    // Fetch if not cached
    ApiClient.getModels()
      .then(data => {
        setModels(data)
        setLoading(false)
      })
  }, [])
  
  return loading ? <Loading /> : <ModelGrid models={models} />
}
```

## Example 6: Refresh All Caches

Invalidate all cached data at once:

```tsx
function Header() {
  const { refreshAll } = useApiCache()
  
  const handleGlobalRefresh = () => {
    refreshAll() // Invalidates all caches
  }
  
  return (
    <button onClick={handleGlobalRefresh}>
      Refresh All Data
    </button>
  )
}
```

## Example 7: SignalR Integration (Future)

When SignalR is implemented, use the hook for automatic invalidation:

```tsx
import { useSignalRCacheInvalidation } from '../hooks/useApiCache'

function App() {
  const [connection] = useState(() => 
    new HubConnectionBuilder()
      .withUrl('/api/hub')
      .build()
  )
  
  // Automatically invalidate cache on SignalR events
  useSignalRCacheInvalidation(connection)
  
  return <div>{/* app content */}</div>
}
```

## Example 8: Custom Cache TTL

Adjust cache TTL for specific use cases:

```tsx
import { useApiCacheStore } from '../stores/apiCacheStore'

function App() {
  const store = useApiCacheStore()
  
  useEffect(() => {
    // Set cache TTL to 10 minutes
    store.defaultTTL = 10 * 60 * 1000
  }, [])
  
  return <div>{/* app content */}</div>
}
```

## Example 9: Conditional Caching

Use cache based on user preferences:

```tsx
function ModelList() {
  const [useCache, setUseCache] = useState(true)
  const [models, setModels] = useState<Model[]>([])
  
  const fetchModels = async () => {
    const data = await ApiClient.getModels({ 
      skipCache: !useCache 
    })
    setModels(data)
  }
  
  return (
    <div>
      <label>
        <input 
          type="checkbox" 
          checked={useCache}
          onChange={e => setUseCache(e.target.checked)}
        />
        Use cache
      </label>
      <button onClick={fetchModels}>Load Models</button>
    </div>
  )
}
```

## Example 10: Direct Store Access for Advanced Use

Access the store directly for complex scenarios:

```tsx
import { useApiCacheStore } from '../stores/apiCacheStore'

function CacheDebugger() {
  const store = useApiCacheStore()
  
  const cacheInfo = {
    models: store.models ? 'Cached' : 'Not cached',
    textureSets: store.textureSets ? 'Cached' : 'Not cached',
    packs: store.packs ? 'Cached' : 'Not cached',
    ttl: store.defaultTTL / 1000 + ' seconds'
  }
  
  return (
    <div>
      <h3>Cache Status</h3>
      <pre>{JSON.stringify(cacheInfo, null, 2)}</pre>
      <button onClick={() => store.invalidateAll()}>
        Clear All
      </button>
    </div>
  )
}
```

## Best Practices

1. **Use automatic caching by default** - The cache is transparent
2. **Only bypass cache when necessary** - Use `skipCache: true` sparingly
3. **Use refresh hooks for user actions** - Let users trigger cache refresh
4. **Plan for SignalR** - Cache invalidation will be automatic with real-time updates
5. **Monitor cache in dev** - Use browser dev tools to inspect Zustand store
6. **Test with cache disabled** - Ensure app works without cache

## Performance Tips

1. **Cache hits save network requests** - Especially beneficial for:
   - Page refreshes
   - Tab switching
   - Component re-renders

2. **TTL balances freshness and performance**:
   - Shorter TTL (1-2 min) - More fresh data, more requests
   - Longer TTL (10-15 min) - Better performance, potentially stale data

3. **Invalidation strategy**:
   - Mutations automatically invalidate related caches
   - User actions can trigger manual refresh
   - SignalR will provide real-time invalidation

## Debugging

### Check if data is cached:

```tsx
const store = useApiCacheStore.getState()
console.log('Models cached:', store.getModels())
```

### Monitor cache hits/misses:

```tsx
// Add logging to ApiClient (development only)
const data = store.getModels()
if (data) {
  console.log('Cache hit: models')
} else {
  console.log('Cache miss: models - fetching from API')
}
```

### Clear cache for testing:

```tsx
// In browser console or React DevTools
useApiCacheStore.getState().invalidateAll()
```
