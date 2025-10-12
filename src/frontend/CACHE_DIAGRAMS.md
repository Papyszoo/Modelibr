# API Response Caching - Visual Flow Diagrams

## Cache Hit Flow (Fast Path)

```
┌─────────────────┐
│   Component     │
│   Requests      │
│   Data          │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│   ApiClient.getModels()     │
│                             │
│   1. Check cache store      │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Cache Store               │
│   ✓ Models cached           │
│   ✓ Age < 5 minutes         │
└────────┬────────────────────┘
         │
         ↓ (cache hit)
┌─────────────────────────────┐
│   Return Cached Data        │
│   ⚡ Instant response        │
│   📡 No network request     │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Component Renders         │
│   ✨ Fast display           │
└─────────────────────────────┘

Time: ~5ms (in-memory read)
Network Requests: 0
```

## Cache Miss Flow (Network Path)

```
┌─────────────────┐
│   Component     │
│   Requests      │
│   Data          │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│   ApiClient.getModels()     │
│                             │
│   1. Check cache store      │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Cache Store               │
│   ✗ No cache OR             │
│   ✗ Age > 5 minutes         │
└────────┬────────────────────┘
         │
         ↓ (cache miss)
┌─────────────────────────────┐
│   Fetch from API            │
│   📡 Network request        │
│   ⏳ Wait for response      │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Update Cache Store        │
│   💾 Store with timestamp   │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Return Fresh Data         │
│   ✅ Latest from server     │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Component Renders         │
│   ✨ Display data           │
└─────────────────────────────┘

Time: ~200ms (network + processing)
Network Requests: 1
Next Request (< 5min): Cache hit! ⚡
```

## Cache Invalidation Flow (Data Changes)

```
┌─────────────────────────────┐
│   User Action               │
│   (Upload/Update/Delete)    │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   ApiClient Mutation        │
│   POST /models              │
│   PUT /texture-sets/:id     │
│   DELETE /packs/:id         │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   API Request Sent          │
│   📡 Server processes       │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Response Received         │
│   ✅ Success                │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Automatic Invalidation    │
│   🗑️ Clear related cache   │
│                             │
│   Examples:                 │
│   - Upload model → clear    │
│     models cache            │
│   - Update set → clear      │
│     texture sets cache      │
│   - Add to pack → clear     │
│     both caches             │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Next Request              │
│   ⚡ Cache miss              │
│   📡 Fetches fresh data     │
│   💾 Repopulates cache      │
└─────────────────────────────┘

Result: Always shows latest data after changes
```

## Manual Refresh Flow (User Initiated)

```
┌─────────────────────────────┐
│   User Clicks               │
│   "Refresh" Button          │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   useApiCache Hook          │
│   refreshModels()           │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Invalidate Cache          │
│   🗑️ Clear models cache     │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   ApiClient.getModels()     │
│   { skipCache: true }       │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Fetch from API            │
│   📡 Force fresh data       │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Update Cache              │
│   💾 Store fresh data       │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Show Success Toast        │
│   ✅ "Models refreshed"     │
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│   Component Re-renders      │
│   ✨ Updated data           │
└─────────────────────────────┘

Result: User sees fresh data immediately
```

## Multi-Component Sharing (Cache Efficiency)

```
Time: 0ms

Component A              Component B              Component C
     │                        │                        │
     │ getModels()            │                        │
     ↓                        │                        │
┌─────────────┐              │                        │
│ API Client  │              │                        │
│ Check cache │              │                        │
│ ✗ Miss      │              │                        │
└──────┬──────┘              │                        │
       │                      │                        │
       ↓                      │                        │
    📡 Fetch                 │                        │
       │                      │                        │
       ↓                      │                        │
    💾 Cache                 │                        │
       │                      │                        │
       ↓                      │                        │
    ✅ Return                │                        │

Time: 50ms                   │                        │
                             │                        │
                             │ getModels()            │
                             ↓                        │
                        ┌─────────────┐              │
                        │ API Client  │              │
                        │ Check cache │              │
                        │ ✓ HIT! ⚡   │              │
                        └──────┬──────┘              │
                               │                      │
                               ↓                      │
                            ✅ Return                │
                            (cached)                 │
                                                      │
Time: 100ms (50ms from A)                            │
                                                      │
                                                      │ getModels()
                                                      ↓
                                                 ┌─────────────┐
                                                 │ API Client  │
                                                 │ Check cache │
                                                 │ ✓ HIT! ⚡   │
                                                 └──────┬──────┘
                                                        │
                                                        ↓
                                                     ✅ Return
                                                     (cached)

Time: 150ms (50ms from A)

Total Network Requests: 1 (instead of 3)
Time Saved: 400ms (2 network round trips)
Cache Efficiency: 67% reduction
```

## Cache Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     Cache Entry Lifecycle                    │
└─────────────────────────────────────────────────────────────┘

1. EMPTY STATE
   ┌─────────────┐
   │ Cache: null │
   │ Age: N/A    │
   └─────────────┘

2. FIRST FETCH (Cache Miss)
   │
   ↓ API call
   ┌──────────────────────┐
   │ Cache: [models...]   │
   │ Timestamp: 10:00:00  │
   │ Age: 0 seconds       │
   │ Status: Fresh ✓      │
   └──────────────────────┘

3. CACHED READS (Cache Hits)
   10:00:30 → Age: 30s  → Return cached ⚡
   10:02:00 → Age: 2m   → Return cached ⚡
   10:04:30 → Age: 4.5m → Return cached ⚡

4. TTL EXPIRATION (Cache Miss)
   10:05:30 → Age: 5.5m → Expired ✗
   │
   ↓ API call
   ┌──────────────────────┐
   │ Cache: [models...]   │
   │ Timestamp: 10:05:30  │
   │ Age: 0 seconds       │
   │ Status: Fresh ✓      │
   └──────────────────────┘

5. INVALIDATION (Manual/Automatic)
   │
   ↓ User upload OR manual refresh
   ┌─────────────┐
   │ Cache: null │
   │ Age: N/A    │
   └─────────────┘
   │
   ↓ Next request (Cache Miss)
   API call → Repopulate cache
```

## Performance Comparison

### Without Caching
```
User Action          Network Requests    Time
─────────────────────────────────────────────
Open ModelList       1 request           200ms
Refresh page         1 request           200ms
Switch to tab        1 request           200ms
Switch back          1 request           200ms
Re-render component  1 request           200ms
─────────────────────────────────────────────
TOTAL                5 requests          1000ms
```

### With Caching
```
User Action          Network Requests    Time      Cache Status
────────────────────────────────────────────────────────────────
Open ModelList       1 request           200ms     Miss → Cache
Refresh page         0 requests          5ms       Hit ⚡
Switch to tab        0 requests          5ms       Hit ⚡
Switch back          0 requests          5ms       Hit ⚡
Re-render component  0 requests          5ms       Hit ⚡
────────────────────────────────────────────────────────────────
TOTAL                1 request           220ms     80% faster!
```

### Improvement Summary
- **Requests Saved**: 4 out of 5 (80% reduction)
- **Time Saved**: 780ms (78% faster)
- **User Experience**: Near-instant responses
- **Server Load**: 80% reduction
- **Network Usage**: 80% reduction

## SignalR Integration (Future)

```
┌─────────────────────────────────────────────────────────────┐
│              Real-time Cache Invalidation                    │
└─────────────────────────────────────────────────────────────┘

Server Side                          Client Side
     │                                    │
     │ Model created/updated              │
     ↓                                    │
[Save to DB]                              │
     │                                    │
     ↓                                    │
[SignalR Hub]                             │
     │                                    │
     │ Broadcast event                    │
     ├────────────────────────────────────→ [SignalR Client]
     │ "ModelUpdated"                     │        │
     │                                    │        ↓
     │                                    │   [Event Handler]
     │                                    │        │
     │                                    │        ↓
     │                                    │   [Invalidate Cache]
     │                                    │        │
     │                                    │        ↓
     │                                    │   [Background Fetch]
     │ ←────────────────────────────────────      │
     │                                    │        ↓
     ↓                                    │   [Update UI]
[Continue...]                             └───────────→

Result: Cache always synchronized with server
No polling needed, instant updates
```

## Key Takeaways

1. **Cache Hits are Fast** ⚡
   - ~5ms vs ~200ms (40x faster)
   - No network overhead
   - Instant user experience

2. **Smart Invalidation** 🧠
   - Automatic on mutations
   - Manual refresh available
   - Cross-resource awareness

3. **Efficient Sharing** 🤝
   - Multiple components use same cache
   - Reduces duplicate requests
   - Better resource utilization

4. **Future-Ready** 🔮
   - SignalR integration prepared
   - Real-time updates possible
   - Scalable architecture
