# Queue System Architecture Comparison

## Before (SignalR Push-based)

```
┌─────────────┐
│   Upload    │
│   Request   │
└─────┬───────┘
      │
      ▼
┌─────────────────────┐
│  Backend WebAPI     │
│                     │
│  1. Save model      │
│  2. Create job      │
│  3. Send SignalR    │◄─────┐
│     notification    │      │
└──────────┬──────────┘      │
           │                 │
           ▼                 │
    ┌──────────────┐         │
    │   SignalR    │         │
    │     Hub      │         │
    └──────┬───────┘         │
           │                 │
           ▼                 │
    ┌──────────────────────┐ │
    │  Push Notification   │ │
    │  (Real-time)         │ │
    └──────┬───────────────┘ │
           │                 │
           ▼                 │
    ┌──────────────────────┐ │
    │   Worker receives    │ │
    │   notification       │ │
    │                      │ │
    │   ISSUE: Multiple    │ │
    │   notifications can  │ │
    │   arrive before job  │ │
    │   is fully processed,│ │
    │   causing models to  │ │
    │   stack in scene     │ │
    └──────────────────────┘ │
                             │
    Problem: Race conditions  │
    when multiple uploads    │
    happen quickly ──────────┘
```

## After (Polling-based)

```
┌─────────────┐
│   Upload    │
│   Request   │
└─────┬───────┘
      │
      ▼
┌─────────────────────┐
│  Backend WebAPI     │
│                     │
│  1. Save model      │
│  2. Create job in   │
│     database queue  │
│                     │
│  No notifications   │
│  sent to workers    │
└─────────────────────┘
           ▲
           │
           │ Poll every 5s (configurable)
           │
    ┌──────┴───────────────┐
    │   Worker Service     │
    │                      │
    │   Polling Loop:      │
    │   1. Check capacity  │
    │   2. Poll for jobs   │
    │   3. Claim job       │
    │      (atomic DB      │
    │       transaction)   │
    │   4. Process job     │
    │   5. Complete job    │
    │   6. Repeat          │
    │                      │
    │   ✓ Sequential       │
    │     processing       │
    │   ✓ No race          │
    │     conditions       │
    │   ✓ Reliable         │
    └──────────────────────┘

    Database ensures:
    - Only one worker claims each job
    - Jobs processed sequentially per worker
    - No model stacking in scene
```

## Key Differences

| Aspect | SignalR (Before) | Polling (After) |
|--------|------------------|-----------------|
| **Notification** | Push-based, real-time | Pull-based, periodic |
| **Job Claiming** | After notification | During poll |
| **Race Conditions** | Possible with quick uploads | Prevented by DB transaction |
| **Model Stacking** | ❌ Can occur | ✅ Prevented |
| **Complexity** | Higher (SignalR infrastructure) | Lower (simple polling) |
| **Reliability** | Depends on network/SignalR | Database-backed |
| **Scalability** | Workers must maintain connection | Workers poll independently |
| **Responsiveness** | Immediate | Configurable (default 5s) |

## Configuration

### Worker Service (.env)
```bash
# Polling interval in milliseconds (min: 1000, default: 5000)
POLL_INTERVAL_MS=5000

# Maximum concurrent jobs per worker
MAX_CONCURRENT_JOBS=3
```

### Backend (Program.cs)
```csharp
// Use NoOp service instead of SignalR for polling-based queue
builder.Services.AddScoped<IThumbnailJobQueueNotificationService, 
    NoOpThumbnailJobQueueNotificationService>();
```
