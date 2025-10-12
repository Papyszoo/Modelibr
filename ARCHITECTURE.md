# Upload Progress Architecture Diagram

## Component Hierarchy

```
App (UploadProgressProvider)
├── SplitterLayout
│   ├── LeftPanel
│   │   └── Tabs
│   │       ├── ModelList
│   │       │   └── useFileUpload() ──┐
│   │       ├── TextureSetList         │
│   │       │   └── useGenericFileUpload() ──┐
│   │       └── PackViewer             │     │
│   │           ├── useModelUpload() ──┤     │
│   │           └── useGenericFileUpload() ──┤
│   └── RightPanel                      │     │
│       └── Tabs                        │     │
│           └── TextureCard             │     │
│               └── useGenericFileUpload() ──┤
│                                       │     │
└── UploadProgressWindow ◄──────────────┴─────┘
    (listens to UploadProgressContext)
```

## Data Flow

### 1. Upload Initiation
```
User selects file(s)
        ↓
Component calls upload hook
(useFileUpload / useGenericFileUpload / useModelUpload)
        ↓
Hook calls: uploadProgressContext.addUpload(file, fileType)
        ↓
Creates upload item with ID and adds to context state
        ↓
UploadProgressWindow shows (if hidden) and displays item
```

### 2. Upload Progress
```
Hook starts upload (ApiClient.uploadModel/uploadFile)
        ↓
Hook updates progress: uploadProgressContext.updateUploadProgress(id, percent)
        ↓
Context updates upload item status and progress
        ↓
UploadProgressWindow re-renders with new progress
        ↓
Progress bar animates to new percentage
```

### 3. Upload Completion
```
ApiClient returns result
        ↓
Hook calls: uploadProgressContext.completeUpload(id, result)
        ↓
Context marks upload as completed
        ↓
UploadProgressWindow shows success state
        ↓
User can open in new tab or remove
```

### 4. Upload Failure
```
ApiClient throws error
        ↓
Hook calls: uploadProgressContext.failUpload(id, error)
        ↓
Context marks upload as error
        ↓
UploadProgressWindow shows error state with message
        ↓
User can remove failed upload
```

## State Management

### UploadProgressContext State
```typescript
{
  uploads: UploadItem[],        // Array of all uploads
  isVisible: boolean,            // Window visibility
  
  // Actions
  addUpload(file, type): string,           // Returns upload ID
  updateUploadProgress(id, progress): void,
  completeUpload(id, result): void,
  failUpload(id, error): void,
  removeUpload(id): void,
  clearCompleted(): void,
  showWindow(): void,
  hideWindow(): void
}
```

### UploadItem Structure
```typescript
{
  id: string,                    // Unique identifier
  file: File,                    // Original file object
  progress: number,              // 0-100
  status: 'pending' | 'uploading' | 'completed' | 'error',
  result?: any,                  // Upload result (if completed)
  error?: Error,                 // Error object (if failed)
  fileType: 'model' | 'texture' | 'file'
}
```

## Upload Hooks Comparison

### useFileUpload (Enhanced)
- **Purpose**: Upload 3D model files with validation
- **Features**:
  - File format validation
  - Three.js renderability check (optional)
  - Single and multiple file uploads
  - Toast notifications
  - Global progress tracking
- **Used by**: ModelList
- **API**: `ApiClient.uploadModel()`

### useGenericFileUpload (New)
- **Purpose**: Upload texture and generic files
- **Features**:
  - Simple file upload without validation
  - Single and multiple file uploads
  - Global progress tracking
- **Used by**: TextureSetList, TextureCard, PackViewer (textures)
- **API**: `ApiClient.uploadFile()`

### useModelUpload (New)
- **Purpose**: Simplified model upload
- **Features**:
  - Direct model upload
  - Global progress tracking
  - No validation (delegated to API)
- **Used by**: PackViewer (models)
- **API**: `ApiClient.uploadModel()`

## Window Integration Points

### 1. ModelList Integration
```typescript
const { uploadMultipleFiles } = useFileUpload({
  requireThreeJSRenderable: true,
  toast,
  onSuccess: () => fetchModels()
})

// Drag & drop or file input
const files = event.dataTransfer.files
await uploadMultipleFiles(files)
// → Automatically tracked in global window
```

### 2. PackViewer Integration (Models)
```typescript
const { uploadModel } = useModelUpload()

for (const file of files) {
  const response = await uploadModel(file)
  await ApiClient.addModelToPack(packId, response.id)
  // → Automatically tracked in global window
}
```

### 3. PackViewer Integration (Textures)
```typescript
const { uploadFile } = useGenericFileUpload({ fileType: 'texture' })

for (const file of files) {
  const fileResponse = await uploadFile(file)
  const setResponse = await ApiClient.createTextureSet({ name })
  await ApiClient.addTextureToSetEndpoint(setResponse.id, {...})
  // → Automatically tracked in global window
}
```

### 4. TextureSetList Integration
```typescript
const { uploadFile } = useGenericFileUpload({ fileType: 'texture' })

for (const file of files) {
  const uploadResult = await uploadFile(file)
  const createResult = await textureSetsApi.createTextureSet({ name })
  await ApiClient.addTextureToSetEndpoint(createResult.id, {...})
  // → Automatically tracked in global window
}
```

### 5. TextureCard Integration
```typescript
const { uploadFile } = useGenericFileUpload({ fileType: 'texture' })

const uploadResult = await uploadFile(file)
await textureSetsApi.addTextureToSetEndpoint(setId, {
  fileId: uploadResult.fileId,
  textureType
})
// → Automatically tracked in global window
```

## Window Lifecycle

```
1. App loads
   ↓
2. UploadProgressProvider initializes
   ↓
3. UploadProgressWindow mounts (hidden)
   ↓
4. User initiates upload
   ↓
5. Upload hook calls context.addUpload()
   ↓
6. Context updates state → uploads: [newUpload]
   ↓
7. Context sets isVisible: true
   ↓
8. Window shows with upload item
   ↓
9. Upload progresses → context updates
   ↓
10. Window re-renders with new progress
    ↓
11. Upload completes → status: 'completed'
    ↓
12. User switches tabs
    ↓
13. Window stays visible (global state)
    ↓
14. User clicks "Clear Completed"
    ↓
15. Context removes completed uploads
    ↓
16. If no uploads, window can be closed
```

## Benefits of This Architecture

1. **Separation of Concerns**
   - Upload logic in hooks
   - State management in context
   - UI rendering in window component

2. **Reusability**
   - Hooks can be used anywhere
   - Context provides global state
   - Window works with any upload

3. **Testability**
   - Hooks can be tested with provider
   - Context can be tested independently
   - Window can be tested with mock context

4. **Maintainability**
   - Clear data flow
   - Single source of truth (context)
   - Easy to add new upload types

5. **User Experience**
   - Unified upload tracking
   - Persistent across tabs
   - Visual feedback for all uploads
