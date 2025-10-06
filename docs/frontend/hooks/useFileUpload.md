# useFileUpload

Custom hook for handling file uploads with validation and progress tracking.

## Purpose

Provides a robust file upload system with:
- File format validation
- Three.js renderability checking
- Upload progress tracking
- Error handling
- Toast notifications
- Multi-file upload support

## Import

```typescript
import { useFileUpload, useDragAndDrop } from '../hooks/useFileUpload'
```

## API

### useFileUpload(options?)

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options` | `object` | `{}` | Configuration options |
| `options.requireThreeJSRenderable` | `boolean` | `false` | Only allow Three.js renderable formats (OBJ, GLTF, GLB) |
| `options.onSuccess` | `(file: File, result: any) => void` | - | Callback called on successful upload |
| `options.onError` | `(file: File, error: Error) => void` | - | Callback called on upload error |
| `options.toast` | `React.RefObject<Toast>` | - | PrimeReact Toast reference for notifications |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `uploading` | `boolean` | Whether an upload is in progress |
| `uploadProgress` | `number` | Upload progress percentage (0-100) |
| `uploadFile` | `(file: File) => Promise<object>` | Upload a single file with UI feedback |
| `uploadMultipleFiles` | `(files: FileList \| File[]) => Promise<object>` | Upload multiple files with progress tracking |
| `uploadSingleFile` | `(file: File) => Promise<object>` | Upload a single file without UI state updates |

#### Upload Result Object

```typescript
{
  succeeded: Array<{ file: File, result: any }>,
  failed: Array<{ file: File, error: Error }>,
  total: number
}
```

## Error Types

The hook provides specific error types for better error handling:

| Error Type | Description |
|------------|-------------|
| `UNSUPPORTED_FORMAT` | File format is not supported |
| `NON_RENDERABLE` | File is supported but not renderable in 3D viewer |
| `NETWORK_ERROR` | Network or API error |

## Usage Examples

### Basic Upload

```typescript
import { useFileUpload } from '../hooks/useFileUpload'

function MyComponent() {
  const { uploading, uploadProgress, uploadFile } = useFileUpload()

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (file) {
      try {
        const result = await uploadFile(file)
        console.log('Upload successful:', result)
      } catch (error) {
        console.error('Upload failed:', error)
      }
    }
  }

  return (
    <div>
      <input type="file" onChange={handleFileSelect} />
      {uploading && <div>Progress: {uploadProgress}%</div>}
    </div>
  )
}
```

### Upload with Validation and Notifications

```typescript
import { useRef } from 'react'
import { Toast } from 'primereact/toast'
import { useFileUpload } from '../hooks/useFileUpload'

function UploadComponent() {
  const toast = useRef(null)
  
  const { uploading, uploadProgress, uploadFile } = useFileUpload({
    requireThreeJSRenderable: true,
    onSuccess: (file, result) => {
      console.log('File uploaded:', file.name)
      // Additional success handling
    },
    onError: (file, error) => {
      console.error('Upload failed for:', file.name, error)
    },
    toast
  })

  const handleUpload = async (file) => {
    try {
      await uploadFile(file)
    } catch (error) {
      // Error already handled by toast
    }
  }

  return (
    <>
      <Toast ref={toast} />
      {/* Upload UI */}
    </>
  )
}
```

### Multi-File Upload

```typescript
import { useFileUpload } from '../hooks/useFileUpload'

function MultiUploadComponent() {
  const { uploading, uploadProgress, uploadMultipleFiles } = useFileUpload()

  const handleMultipleFiles = async (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const results = await uploadMultipleFiles(files)
      
      console.log(`Uploaded ${results.succeeded.length} files`)
      console.log(`Failed ${results.failed.length} files`)
      
      results.failed.forEach(({ file, error }) => {
        console.error(`${file.name}: ${error.message}`)
      })
    }
  }

  return (
    <div>
      <input type="file" multiple onChange={handleMultipleFiles} />
      {uploading && (
        <div>
          <progress value={uploadProgress} max={100} />
          <span>{uploadProgress.toFixed(0)}%</span>
        </div>
      )}
    </div>
  )
}
```

## useDragAndDrop

Utility hook for creating drag and drop handlers.

### API

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `onFilesDropped` | `(files: File[]) => void` | Callback when files are dropped |

#### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `onDrop` | `(e: DragEvent) => void` | Drop event handler |
| `onDragOver` | `(e: DragEvent) => void` | Drag over event handler |
| `onDragEnter` | `(e: DragEvent) => void` | Drag enter event handler |
| `onDragLeave` | `(e: DragEvent) => void` | Drag leave event handler |

### Usage Example

```typescript
import { useDragAndDrop } from '../hooks/useFileUpload'

function DropZone() {
  const handleFilesDropped = (files) => {
    console.log('Files dropped:', files)
    // Process files
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } = 
    useDragAndDrop(handleFilesDropped)

  return (
    <div
      className="drop-zone"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      Drop files here
    </div>
  )
}
```

## Visual Feedback

The drag and drop handlers automatically add CSS classes for visual feedback:

- `dragging-file` - Added to `document.body` when files are being dragged
- `drag-over` - Added to the drop zone when files are over it

These classes are automatically removed when the drag operation ends.

## Related

- [ModelGrid](../components/ModelGrid.md) - Uses drag and drop for file uploads
- [EmptyState](../components/EmptyState.md) - Uses drag and drop in empty state
- [fileUtils](../utils/fileUtils.md) - File validation utilities
