# Getting Started with Modelibr Frontend

This guide will help you understand and work with the Modelibr frontend codebase.

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Basic knowledge of React and TypeScript
- Familiarity with Three.js (helpful but not required)

### Setup

1. **Navigate to frontend directory:**
   ```bash
   cd src/frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   # Create .env file in src/frontend/
   VITE_API_BASE_URL=https://localhost:8081
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

5. **Open in browser:**
   ```
   http://localhost:5173
   ```

## Project Structure

```
src/frontend/
├── src/
│   ├── components/       # React components
│   ├── hooks/           # Custom hooks
│   ├── utils/           # Utility functions
│   ├── services/        # API clients
│   ├── contexts/        # React contexts
│   ├── types/           # TypeScript types
│   ├── App.tsx          # Root component
│   └── main.tsx         # Entry point
├── public/              # Static assets
└── docs/                # Documentation (this file)
```

## Core Concepts

### 1. Component Architecture

The app uses a hierarchical component structure:

```
App
└── SplitterLayout (resizable panels)
    ├── DockPanel (left)
    └── DockPanel (right)
```

**Key Components:**
- `SplitterLayout` - Main layout with resizable panels
- `DockPanel` - Tabbed panel container
- `ModelList` - Model list with upload
- `ModelViewer` - 3D model viewer

### 2. State Management

**URL State (Primary):**
```typescript
import { useQueryState } from 'nuqs'

const [tabs, setTabs] = useQueryState('tabs', {
  defaultValue: [],
  parse: parseCompactTabFormat,
  serialize: serializeToCompactFormat,
})
```

**Local State:**
```typescript
const [models, setModels] = useState<Model[]>([])
```

**Context State:**
```typescript
const { openTab, activeTab } = useTabContext()
```

### 3. Custom Hooks

Hooks encapsulate reusable logic:

```typescript
// File upload
const { uploadFile, uploading } = useFileUpload({
  toast,
  onSuccess: () => fetchModels()
})

// Direct API usage for simple operations
const [thumbnail, setThumbnail] = useState(null)
useEffect(() => {
  ApiClient.getThumbnailStatus(modelId).then(status => {
    if (status.status === 'Ready') {
      ApiClient.getThumbnailFile(modelId).then(blob => {
        setThumbnail(URL.createObjectURL(blob))
      })
    }
  })
}, [modelId])

// Tab operations
const { openModelDetailsTab } = useTabContext()
```

### 4. API Communication

All API calls go through `ApiClient`:

```typescript
import ApiClient from './services/ApiClient'

// Fetch models
const models = await ApiClient.getModels()

// Upload model
const result = await ApiClient.uploadModel(file)

// Get thumbnail status
const status = await ApiClient.getThumbnailStatus(modelId)
```

## Common Tasks

### Task 1: Adding a New Component

```typescript
// 1. Create component file
// src/components/MyComponent.tsx

import { JSX } from 'react'

interface MyComponentProps {
  title: string
  onAction: () => void
}

function MyComponent({ title, onAction }: MyComponentProps): JSX.Element {
  return (
    <div>
      <h2>{title}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  )
}

export default MyComponent
```

### Task 2: Creating a Custom Hook

```typescript
// 2. Create hook file
// src/hooks/useMyFeature.ts

import { useState, useCallback } from 'react'

export function useMyFeature() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await ApiClient.getData()
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, fetchData }
}
```

### Task 3: Adding API Endpoint

```typescript
// 3. Update ApiClient
// src/services/ApiClient.ts

class ApiClient {
  // ... existing methods

  async getMyData(): Promise<MyData[]> {
    const response = await this.client.get('/my-endpoint')
    return response.data
  }
}
```

### Task 4: Adding a New Tab Type

```typescript
// 4. Update types
// src/types/index.ts

export interface Tab {
  id: string
  type: 'modelList' | 'modelViewer' | 'texture' | 'animation' | 'myNewType'
  label?: string
  modelId?: string
}

// 5. Add tab content renderer
// In TabContent.tsx

switch (activeTabData.type) {
  case 'myNewType':
    return <MyNewTypeComponent />
  // ... other cases
}
```

## Working with 3D Models

### Loading a Model

```typescript
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'

function ModelViewer({ model }) {
  return (
    <Canvas shadows camera={{ position: [0, 2, 5] }}>
      <Scene model={model} />
    </Canvas>
  )
}
```

### Supported Formats

- **OBJ** - Basic geometry, materials applied automatically
- **GLTF** - Full scene with materials and animations
- **GLB** - Binary GLTF, smaller file size

### Model Pipeline

1. User uploads file
2. Backend processes and stores
3. Frontend fetches model data
4. Three.js loads and renders
5. User interacts with 3D viewer

## File Upload Flow

### 1. Setup Upload Hook

```typescript
const { uploadMultipleFiles, uploading, uploadProgress } = useFileUpload({
  requireThreeJSRenderable: false,
  toast,
  onSuccess: () => fetchModels()
})
```

### 2. Setup Drag and Drop

```typescript
const { onDrop, onDragOver, onDragEnter, onDragLeave } = 
  useDragAndDrop(async (files) => {
    await uploadMultipleFiles(files)
  })
```

### 3. Create Upload Zone

```typescript
<div
  className="upload-zone"
  onDrop={onDrop}
  onDragOver={onDragOver}
  onDragEnter={onDragEnter}
  onDragLeave={onDragLeave}
>
  Drop files here or click to browse
</div>
```

## Direct API Usage

### Fetching Thumbnail Status

```typescript
const [thumbnailDetails, setThumbnailDetails] = useState(null)
const [imgSrc, setImgSrc] = useState(null)

useEffect(() => {
  const fetchThumbnailDetails = async () => {
    const details = await ApiClient.getThumbnailStatus(modelId)
    setThumbnailDetails(details)
  }
  fetchThumbnailDetails()
}, [modelId])

useEffect(() => {
  const fetchImg = async () => {
    try {
      const blob = await ApiClient.getThumbnailFile(modelId)
      const url = URL.createObjectURL(blob)
      setImgSrc(url)
    } catch (error) {
      setImgSrc(null)
    }
  }
  if (thumbnailDetails?.status === 'Ready') {
    fetchImg()
  }
  return () => {
    if (imgSrc) URL.revokeObjectURL(imgSrc)
  }
}, [modelId, thumbnailDetails])

// Status updates automatically via SignalR
if (isReady) {
  return <img src={thumbnailUrl} />
}
```

### Connection Management

- Automatic connection on mount
- Auto-reconnect on disconnect
- Fallback to REST API if SignalR fails

## Styling

### CSS Modules

```typescript
import styles from './MyComponent.module.css'

function MyComponent() {
  return <div className={styles.container}>Content</div>
}
```

### PrimeReact Theming

```typescript
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
```

### Custom Styles

```css
/* Global styles in index.css */
:root {
  --primary-color: #3b82f6;
  --background-color: #f8fafc;
}

.custom-component {
  background: var(--background-color);
  color: var(--primary-color);
}
```

## Debugging

### React DevTools

Install React DevTools browser extension:
- Inspect component hierarchy
- View props and state
- Profile performance

### Console Logging

```typescript
// Development only
if (import.meta.env.DEV) {
  console.log('Debug info:', data)
}
```

### Network Debugging

```typescript
// Check API requests in browser DevTools
// Or add interceptor to ApiClient

this.client.interceptors.request.use(config => {
  console.log('Request:', config)
  return config
})
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

### Writing Tests

```typescript
import { render, screen } from '@testing-library/react'
import MyComponent from './MyComponent'

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test" onAction={() => {}} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('handles action click', () => {
    const onAction = jest.fn()
    render(<MyComponent title="Test" onAction={onAction} />)
    
    screen.getByText('Action').click()
    expect(onAction).toHaveBeenCalled()
  })
})
```

## Build and Deploy

### Development Build

```bash
npm run dev
# Runs on http://localhost:5173
```

### Production Build

```bash
npm run build
# Output in dist/
```

### Preview Production Build

```bash
npm run preview
# Preview built app locally
```

### Environment Variables

```bash
# .env.development
VITE_API_BASE_URL=http://localhost:8080

# .env.production
VITE_API_BASE_URL=https://api.production.com
```

## Best Practices

### 1. TypeScript

Always define types for props and state:

```typescript
interface Props {
  model: Model
  onSelect: (id: string) => void
}

function MyComponent({ model, onSelect }: Props) {
  // ...
}
```

### 2. Error Handling

Handle errors gracefully:

```typescript
try {
  await uploadFile(file)
} catch (error) {
  toast.current.show({
    severity: 'error',
    detail: error.message
  })
}
```

### 3. Accessibility

Use semantic HTML and ARIA labels:

```typescript
<button
  aria-label="Upload model"
  onClick={handleUpload}
>
  <i className="pi pi-upload" aria-hidden="true" />
</button>
```

### 4. Performance

Use memo and callbacks wisely:

```typescript
const MemoizedGrid = memo(ModelGrid)

const handleClick = useCallback(() => {
  // ...
}, [dependencies])
```

## Common Issues

### Issue: API Connection Failed

**Solution:**
```typescript
// Check VITE_API_BASE_URL in .env
// Ensure backend is running
// Check CORS configuration
```

### Issue: 3D Model Not Loading

**Solution:**
```typescript
// Verify file format is supported
// Check file URL is correct
// Look for console errors
// Ensure model file is not corrupted
```

### Issue: Thumbnail Not Updating

**Solution:**
```typescript
// Check SignalR connection status
// Verify backend thumbnail service is running
// Check browser console for WebSocket errors
```

## Next Steps

1. **Explore Documentation:**
   - [Architecture Overview](./ARCHITECTURE.md)
   - [Hooks Documentation](./hooks/)
   - [Components Documentation](./components/)

2. **Try Examples:**
   - Review existing components
   - Run the test suite
   - Experiment with the API

3. **Build Something:**
   - Add a new feature
   - Create a custom component
   - Extend existing functionality

## Resources

- [README](./README.md) - Main documentation index
- [ARCHITECTURE](./ARCHITECTURE.md) - Architecture overview
- [API Client](./services/ApiClient.md) - API documentation
- [Hooks](./hooks/) - Custom hooks documentation
- [Components](./components/) - Component documentation
