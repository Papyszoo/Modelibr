# fileUtils

Utility functions for file handling, validation, and formatting.

## Purpose

Provides comprehensive file utilities:
- File extension extraction
- Format validation
- Three.js renderability checking
- File size formatting
- Model format detection

## Import

```typescript
import {
  getFileExtension,
  getFileName,
  getModelFileFormat,
  formatFileSize,
  isThreeJSRenderable,
  isSupportedModelFormat,
  THREEJS_SUPPORTED_FORMATS,
  ALL_SUPPORTED_FORMATS,
  type Model,
  type ModelFile,
} from '../utils/fileUtils'
```

## Types

### ModelFile

```typescript
interface ModelFile {
  id: string
  originalFileName: string
  storedFileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  sha256Hash: string
  fileType: string
  isRenderable: boolean
  createdAt: string
  updatedAt: string
}
```

### Model

```typescript
interface Model {
  id: string
  name: string
  description?: string
  files: ModelFile[]
  createdAt: string
  updatedAt: string
}
```

## Constants

### THREEJS_SUPPORTED_FORMATS

Three.js renderable formats:

```typescript
const THREEJS_SUPPORTED_FORMATS = [
  '.obj',   // OBJLoader
  '.gltf',  // GLTFLoader
  '.glb',   // GLTFLoader
] as const
```

### ALL_SUPPORTED_FORMATS

All supported 3D model formats:

```typescript
const ALL_SUPPORTED_FORMATS = [
  '.obj',
  '.fbx',
  '.dae',
  '.3ds',
  '.blend',
  '.gltf',
  '.glb',
] as const
```

## Functions

### getFileExtension

Extract file extension from file path or name.

#### Signature

```typescript
function getFileExtension(filePath: string): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `filePath` | `string` | File path or filename |

#### Returns

`string` - Lowercase file extension without dot, or 'unknown' if not found

#### Examples

```typescript
getFileExtension('model.obj')           // 'obj'
getFileExtension('path/to/file.gltf')   // 'gltf'
getFileExtension('Model.OBJ')           // 'obj' (lowercase)
getFileExtension('file')                // 'unknown'
getFileExtension('')                    // 'unknown'
```

### getFileName

Extract filename from file path.

#### Signature

```typescript
function getFileName(filePath: string): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `filePath` | `string` | File path |

#### Returns

`string` - Filename or 'unknown' if not found

#### Examples

```typescript
getFileName('model.obj')                 // 'model.obj'
getFileName('/path/to/model.gltf')       // 'model.gltf'
getFileName('models/3d/character.fbx')   // 'character.fbx'
getFileName('')                          // 'unknown'
```

### getModelFileFormat

Get display format from model files.

#### Signature

```typescript
function getModelFileFormat(model: Model): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | `Model` | Model object with files |

#### Returns

`string` - Uppercase file format or 'Unknown'

#### Examples

```typescript
const model = {
  id: '1',
  name: 'My Model',
  files: [
    { originalFileName: 'model.obj', ... }
  ]
}

getModelFileFormat(model)  // 'OBJ'

const emptyModel = {
  id: '2',
  name: 'Empty',
  files: []
}

getModelFileFormat(emptyModel)  // 'Unknown'
```

### formatFileSize

Format file size in human-readable format.

#### Signature

```typescript
function formatFileSize(bytes: number): string
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `bytes` | `number` | File size in bytes |

#### Returns

`string` - Formatted file size with appropriate unit

#### Examples

```typescript
formatFileSize(0)              // '0 Bytes'
formatFileSize(1024)           // '1 KB'
formatFileSize(1536)           // '1.5 KB'
formatFileSize(1048576)        // '1 MB'
formatFileSize(1073741824)     // '1 GB'
formatFileSize(1234567890)     // '1.15 GB'
```

#### Size Units

| Range | Unit |
|-------|------|
| 0 bytes | '0 Bytes' |
| < 1024 bytes | 'Bytes' |
| < 1024 KB | 'KB' |
| < 1024 MB | 'MB' |
| >= 1024 MB | 'GB' |

### isThreeJSRenderable

Check if file extension is supported by Three.js loaders.

#### Signature

```typescript
function isThreeJSRenderable(fileExtension: string): boolean
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fileExtension` | `string` | File extension (with or without dot) |

#### Returns

`boolean` - True if renderable in Three.js

#### Examples

```typescript
isThreeJSRenderable('.obj')     // true
isThreeJSRenderable('obj')      // true
isThreeJSRenderable('.gltf')    // true
isThreeJSRenderable('.glb')     // true
isThreeJSRenderable('.fbx')     // false
isThreeJSRenderable('.blend')   // false
isThreeJSRenderable('OBJ')      // true (case insensitive)
```

### isSupportedModelFormat

Check if file extension is a supported 3D model format.

#### Signature

```typescript
function isSupportedModelFormat(fileExtension: string): boolean
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fileExtension` | `string` | File extension (with or without dot) |

#### Returns

`boolean` - True if format is supported

#### Examples

```typescript
isSupportedModelFormat('.obj')     // true
isSupportedModelFormat('.fbx')     // true
isSupportedModelFormat('.blend')   // true
isSupportedModelFormat('.gltf')    // true
isSupportedModelFormat('.glb')     // true
isSupportedModelFormat('.dae')     // true
isSupportedModelFormat('.3ds')     // true
isSupportedModelFormat('.stl')     // false
isSupportedModelFormat('OBJ')      // true (case insensitive)
```

## Usage Examples

### File Validation

```typescript
import { isSupportedModelFormat, isThreeJSRenderable } from '../utils/fileUtils'

function validateFile(file: File): { valid: boolean, message: string } {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  
  if (!isSupportedModelFormat(ext)) {
    return {
      valid: false,
      message: `${ext} is not a supported 3D model format`
    }
  }
  
  if (!isThreeJSRenderable(ext)) {
    return {
      valid: true,
      message: `${ext} is supported but cannot be previewed in 3D viewer`
    }
  }
  
  return {
    valid: true,
    message: 'File is valid and renderable'
  }
}
```

### Model Info Display

```typescript
import { getModelFileFormat, formatFileSize } from '../utils/fileUtils'

function ModelInfo({ model }: { model: Model }) {
  const format = getModelFileFormat(model)
  const totalSize = model.files.reduce((sum, file) => sum + file.sizeBytes, 0)
  
  return (
    <div>
      <p>Format: {format}</p>
      <p>Total Size: {formatFileSize(totalSize)}</p>
      <p>Files: {model.files.length}</p>
    </div>
  )
}
```

### File Upload Filter

```typescript
import { ALL_SUPPORTED_FORMATS } from '../utils/fileUtils'

function FileUploadInput() {
  const accept = ALL_SUPPORTED_FORMATS.join(',')
  
  return (
    <input
      type="file"
      accept={accept}
      onChange={handleFileSelect}
    />
  )
}
```

### File List with Details

```typescript
import { getFileExtension, formatFileSize } from '../utils/fileUtils'

function FileList({ files }: { files: ModelFile[] }) {
  return (
    <ul>
      {files.map(file => (
        <li key={file.id}>
          <span>{file.originalFileName}</span>
          <span>{getFileExtension(file.originalFileName).toUpperCase()}</span>
          <span>{formatFileSize(file.sizeBytes)}</span>
          {file.isRenderable && <span>✓ Renderable</span>}
        </li>
      ))}
    </ul>
  )
}
```

### Format Badge Component

```typescript
import { getFileExtension, isThreeJSRenderable } from '../utils/fileUtils'

function FormatBadge({ fileName }: { fileName: string }) {
  const ext = getFileExtension(fileName)
  const renderable = isThreeJSRenderable(ext)
  
  return (
    <span className={`format-badge ${renderable ? 'renderable' : ''}`}>
      {ext.toUpperCase()}
      {renderable && ' 🎨'}
    </span>
  )
}
```

### Conditional Rendering Based on Format

```typescript
import { isThreeJSRenderable, getFileExtension } from '../utils/fileUtils'

function ModelViewer({ model }: { model: Model }) {
  const primaryFile = model.files[0]
  const ext = getFileExtension(primaryFile.originalFileName)
  
  if (!isThreeJSRenderable(ext)) {
    return (
      <div className="not-renderable">
        <p>This {ext.toUpperCase()} file cannot be previewed</p>
        <p>Supported preview formats: OBJ, GLTF, GLB</p>
      </div>
    )
  }
  
  return <ThreeDViewer file={primaryFile} />
}
```

## Format Support Matrix

| Format | Extension | Three.js Renderable | Supported for Upload |
|--------|-----------|-------------------|---------------------|
| OBJ | `.obj` | ✅ Yes | ✅ Yes |
| GLTF | `.gltf` | ✅ Yes | ✅ Yes |
| GLB | `.glb` | ✅ Yes | ✅ Yes |
| FBX | `.fbx` | ❌ No | ✅ Yes |
| Collada | `.dae` | ❌ No | ✅ Yes |
| 3DS | `.3ds` | ❌ No | ✅ Yes |
| Blender | `.blend` | ❌ No | ✅ Yes |

## Related

- [useFileUpload](../hooks/useFileUpload.md) - Uses validation functions
- [Model](../components/Model.md) - Uses format detection
- [ModelsDataTable](../components/ModelsDataTable.md) - Uses file formatting
- [ApiClient](../services/ApiClient.md) - Handles file uploads
