# Upload Progress Window Implementation

This document describes the global upload progress window implementation for Modelibr.

## Overview

A global upload progress window has been implemented that tracks all file uploads across the application. The window displays individual file progress, file metadata, and provides actions for completed uploads.

## Features Implemented

### 1. Global Upload Progress Context
- **File**: `src/frontend/src/contexts/UploadProgressContext.tsx`
- **Hook**: `src/frontend/src/hooks/useUploadProgress.tsx`
- Manages upload state globally across the application
- Tracks individual file uploads with progress, status, and metadata
- Persists across tab switches

### 2. Upload Progress Window Component
- **File**: `src/frontend/src/shared/components/UploadProgressWindow.tsx`
- **Styles**: `src/frontend/src/shared/components/UploadProgressWindow.css`
- Floating window that displays all active and completed uploads
- Features:
  - Individual progress bars for each file
  - File extension icons (image, model, document, etc.)
  - File type icons (model, texture, generic file)
  - File name and size display
  - Overall upload summary with total progress
  - "Open in new tab" button for completed model uploads
  - Remove completed/failed uploads
  - Clear all completed uploads
  - Collapse/expand window
  - Draggable within panel boundaries
  - Stays visible across tab switches

### 3. Upload Hooks Integration

#### useFileUpload (existing, enhanced)
- **File**: `src/frontend/src/shared/hooks/useFileUpload.ts`
- Enhanced to support global upload progress tracking
- Automatically adds uploads to global window when enabled
- Supports both model file uploads with validation

#### useGenericFileUpload (new)
- **File**: `src/frontend/src/shared/hooks/useGenericFileUpload.ts`
- For non-model file uploads (textures, generic files)
- Integrates with global upload progress

#### useModelUpload (new)
- **File**: `src/frontend/src/shared/hooks/useModelUpload.ts`
- Dedicated hook for model file uploads
- Simplified interface for uploading models with progress tracking

### 4. Updated Components

All upload locations now use the global upload progress window:

1. **ModelList** (`src/frontend/src/features/models/components/ModelList.tsx`)
   - Uses enhanced `useFileUpload` hook
   - Model uploads automatically tracked in global window

2. **PackViewer** (`src/frontend/src/features/pack/components/PackViewer.tsx`)
   - Model uploads use `useModelUpload`
   - Texture uploads use `useGenericFileUpload`
   - Both tracked in global window

3. **TextureSetList** (`src/frontend/src/features/texture-set/components/TextureSetList.tsx`)
   - Texture uploads use `useGenericFileUpload`
   - Tracked in global window

4. **TextureCard** (`src/frontend/src/features/texture-set/components/TextureCard.tsx`)
   - Texture uploads use `useGenericFileUpload`
   - Tracked in global window

## UI Elements

### Upload Progress Window
```
┌─────────────────────────────────────────┐
│ File Uploads                    ⌄  ✕    │
├─────────────────────────────────────────┤
│ Uploading 2 files...   [Clear Completed]│
│ [████████████░░░░░░░░] 60%              │
│                                         │
│ 📦 📦 model.obj         500 KB   🗑     │
│     [████████████░░░] 75%               │
│                                         │
│ 🖼 🖼 texture.png       200 KB   ↗ 🗑   │
│     [████████████████] 100%             │
└─────────────────────────────────────────┘
```

### Icons Legend
- 📦 - Model file type icon
- 🖼 - Texture/image file type icon
- 📄 - Generic file extension icon
- ↗ - Open in new tab (for completed uploads)
- 🗑 - Remove upload
- ⌄ - Collapse window
- ✕ - Close window

## File Type Detection

The window automatically detects file types and displays appropriate icons:

### Extension Icons (PrimeIcons)
- Images: `pi-image` (.jpg, .jpeg, .png, .gif, .webp, .svg)
- 3D Models: `pi-box` (.obj, .fbx, .gltf, .glb, .stl, .dae, .3ds)
- Documents: `pi-file-pdf`, `pi-file-word`, `pi-file-excel`
- Archives: `pi-folder` (.zip, .rar, .7z)
- Default: `pi-file`

### File Type Icons
- Model: `pi-box`
- Texture: `pi-image`
- Generic File: `pi-file`

## Upload Statuses

Each upload can have one of the following statuses:
- `pending`: Upload is queued but not started
- `uploading`: Upload is in progress
- `completed`: Upload finished successfully
- `error`: Upload failed

Status-specific styling is applied:
- Completed: Green background
- Error: Red background with error message
- Uploading: Gray background with progress bar

## File Size Formatting

File sizes are automatically formatted:
- Bytes (B)
- Kilobytes (KB)
- Megabytes (MB)
- Gigabytes (GB)

## Integration with Existing Features

The implementation maintains all existing upload functionality:
- ✅ Thumbnail generation for models
- ✅ Texture set creation
- ✅ Pack association
- ✅ File deduplication
- ✅ Validation and error handling
- ✅ Toast notifications

## Window Behavior

1. **Auto-show**: Window automatically appears when an upload starts
2. **Stays open**: Window persists across tab switches (uses FloatingWindow component)
3. **Panel-aware**: Window respects panel boundaries and can't be dragged outside its panel
4. **Collapsible**: Can be minimized to header-only view
5. **Closeable**: Can be hidden but uploads continue in background
6. **Smart positioning**: Positioned at bottom middle of the application panel

## Testing

Unit tests have been updated to work with the new upload progress context:
- Tests wrap hooks in `UploadProgressProvider`
- All existing tests pass with the new implementation
- No breaking changes to existing functionality

## Usage Example

```tsx
import { useModelUpload } from '../../../shared/hooks/useModelUpload'

function MyComponent() {
  const { uploadModel } = useModelUpload()
  
  const handleUpload = async (file: File) => {
    try {
      const result = await uploadModel(file)
      // Upload tracked automatically in global window
      console.log('Upload complete:', result)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }
  
  return <input type="file" onChange={e => handleUpload(e.target.files[0])} />
}
```

## Files Changed

- `src/frontend/src/App.tsx` - Added UploadProgressProvider and UploadProgressWindow
- `src/frontend/src/contexts/UploadProgressContext.tsx` - New context for upload state
- `src/frontend/src/hooks/useUploadProgress.tsx` - New hook to use context
- `src/frontend/src/shared/components/UploadProgressWindow.tsx` - Main window component
- `src/frontend/src/shared/components/UploadProgressWindow.css` - Window styles
- `src/frontend/src/shared/components/index.ts` - Export UploadProgressWindow
- `src/frontend/src/shared/hooks/useFileUpload.ts` - Enhanced with global progress
- `src/frontend/src/shared/hooks/useGenericFileUpload.ts` - New hook for generic files
- `src/frontend/src/shared/hooks/useModelUpload.ts` - New hook for model files
- `src/frontend/src/features/pack/components/PackViewer.tsx` - Updated to use new hooks
- `src/frontend/src/features/texture-set/components/TextureSetList.tsx` - Updated to use new hooks
- `src/frontend/src/features/texture-set/components/TextureCard.tsx` - Updated to use new hooks
- `src/frontend/src/shared/hooks/__tests__/useFileUpload.test.ts` - Updated tests

## Future Enhancements

Potential improvements that could be added:
1. Pause/resume upload functionality
2. Retry failed uploads
3. Upload queue management
4. Bandwidth throttling options
5. Batch upload operations
6. Upload history persistence
