# Frontend Development Guide

React 18+ application with TypeScript, Three.js for 3D rendering, and PrimeReact UI components.

## Quick Start

### Prerequisites
- Node.js 18+
- Backend API running (see main README)

### Setup
```bash
cd src/frontend
npm install
```

### Environment Configuration
Create `.env` file (or use main repository `.env`):
```bash
VITE_API_BASE_URL=https://localhost:8081
```

### Development
```bash
npm run dev          # Start dev server at http://localhost:5173
npm run storybook    # Component docs at http://localhost:6006
```

### Build
```bash
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

## Project Structure

```
src/frontend/src/
├── components/          # React components
│   ├── DockPanel.tsx   # Tabbed panel container
│   ├── ModelList.tsx   # Model library with upload
│   ├── Scene.tsx       # Three.js 3D viewer
│   └── ...
├── hooks/              # Custom React hooks
│   ├── useFileUpload.tsx
│   ├── useTabContext.tsx
│   └── ...
├── contexts/           # React Context providers
│   └── TabContext.tsx  # Tab state management
├── services/           # API clients
│   └── ApiClient.ts    # Backend API client
└── utils/              # Helper functions
    ├── fileUtils.ts
    └── ...
```

## Core Concepts

### Component Architecture

The app uses a hierarchical split-pane layout:

```
App
└── SplitterLayout (resizable panels)
    ├── DockPanel (left)
    │   └── ModelList (model library + upload)
    └── DockPanel (right)
        └── Multiple tabs (3D viewer, details, etc.)
```

### State Management

**URL State (Primary)**
Uses `nuqs` for URL-synchronized state:
```typescript
import { useQueryState } from 'nuqs'

const [tabs, setTabs] = useQueryState('tabs', {
  defaultValue: [],
  parse: parseCompactTabFormat,
  serialize: serializeToCompactFormat,
})
```

**Context State**
For cross-component state:
```typescript
const { openTab, activeTab } = useTabContext()
```

**Local State**
Component-specific state:
```typescript
const [models, setModels] = useState<Model[]>([])
```

### Design Philosophy: Keep It Simple

Components should be **focused and minimal**:
- Single responsibility
- Direct API calls (no unnecessary abstractions)
- Local state by default
- No over-engineering

**Example - Simple Component:**
```typescript
function ThumbnailDisplay({ modelId }: { modelId: string }) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  
  useEffect(() => {
    ApiClient.getThumbnailStatus(modelId).then(status => {
      if (status.status === 'Ready') {
        ApiClient.getThumbnailFile(modelId).then(blob => {
          setThumbnail(URL.createObjectURL(blob))
        })
      }
    })
  }, [modelId])
  
  return thumbnail ? (
    <img src={thumbnail} alt="Thumbnail" />
  ) : (
    <div>Processing...</div>
  )
}
```

**Don't create complex abstractions unless logic is reused in 3+ places.**

## Common Tasks

### Upload a Model

```typescript
import { useFileUpload } from './hooks/useFileUpload'

function MyComponent() {
  const { uploadFile, isUploading } = useFileUpload({
    toast,
    onSuccess: (model) => {
      console.log('Uploaded:', model)
    }
  })
  
  return (
    <input
      type="file"
      onChange={(e) => uploadFile(e.target.files[0])}
      disabled={isUploading}
    />
  )
}
```

### Display 3D Model

```typescript
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Scene } from './components/Scene'

function ModelViewer({ model }) {
  return (
    <Canvas>
      <Suspense fallback={<LoadingPlaceholder />}>
        <Scene model={model} />
      </Suspense>
    </Canvas>
  )
}
```

### Manage Tabs

```typescript
import { useTabContext } from './hooks/useTabContext'

function MyComponent() {
  const { openTab, openModelDetailsTab, activeTab } = useTabContext()
  
  // Open model details tab
  openModelDetailsTab(modelId)
  
  // Open custom tab
  openTab({
    id: 'custom-tab',
    title: 'Custom',
    type: 'custom',
    data: { /* tab data */ }
  })
}
```

### Call API

```typescript
import { ApiClient } from './services/ApiClient'

// Get models
const models = await ApiClient.getModels()

// Upload model
const result = await ApiClient.uploadModel(file)

// Get thumbnail
const status = await ApiClient.getThumbnailStatus(modelId)
if (status.status === 'Ready') {
  const blob = await ApiClient.getThumbnailFile(modelId)
  const url = URL.createObjectURL(blob)
}
```

## Technology Stack

### Core
- **React 18+** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server

### 3D Rendering
- **Three.js** - 3D rendering engine with TSL (Three.js Shading Language)
- **React Three Fiber** - React renderer for Three.js
- **React Three Drei** - Useful helpers for R3F

### UI Components
- **PrimeReact** - UI component library
- **PrimeFlex** - CSS utility framework
- **PrimeIcons** - Icon set

### State Management
- **nuqs** - URL state synchronization
- **React Context** - Global state when needed

### File Upload
- **react-dropzone** - Drag-and-drop file upload

## Testing

### Run Tests
```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

### Test Structure
```typescript
import { render, screen } from '@testing-library/react'
import { ThumbnailDisplay } from './ThumbnailDisplay'

describe('ThumbnailDisplay', () => {
  it('shows placeholder when not ready', async () => {
    mockApiClient.getThumbnailStatus.mockResolvedValue({ 
      status: 'Processing' 
    })
    
    render(<ThumbnailDisplay modelId="1" />)
    
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
  })
})
```

### Testing Philosophy
- Test user-visible behavior, not implementation
- Mock external dependencies (API calls)
- Focus on actual outcomes

## Storybook

Interactive component documentation and development environment.

### Run Storybook
```bash
npm run storybook      # Start at http://localhost:6006
npm run build-storybook # Build static version
```

### Create Stories
```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { ThumbnailDisplay } from './ThumbnailDisplay'

const meta: Meta<typeof ThumbnailDisplay> = {
  title: 'Components/ThumbnailDisplay',
  component: ThumbnailDisplay,
}

export default meta
type Story = StoryObj<typeof ThumbnailDisplay>

export const Ready: Story = {
  args: {
    modelId: 'ready-model'
  },
  decorators: [/* Mock API calls */]
}

export const Processing: Story = {
  args: {
    modelId: 'processing-model'
  }
}
```

### Available Stories

- **Components/LoadingPlaceholder** - 3D loading indicator
- **Components/ModelInfo** - Model information display
- **Components/ThumbnailDisplay** - Thumbnail states
- **Components/Model List/EmptyState** - Empty library state
- **Components/Model List/ErrorState** - Error handling

## Styling

### CSS Modules
```typescript
import styles from './Component.module.css'

function Component() {
  return <div className={styles.container}>...</div>
}
```

### PrimeFlex Utilities
```tsx
<div className="flex justify-content-center align-items-center p-3">
  <Button label="Click" />
</div>
```

### Theme
Uses PrimeReact Lara theme (light mode). Customize in `src/main.tsx`:
```typescript
import 'primereact/resources/themes/lara-light-blue/theme.css'
```

## Best Practices

### Component Design
- ✅ Keep components focused and simple
- ✅ Use direct API calls for single-use logic
- ✅ Local state by default, lift up when shared
- ❌ Don't create custom hooks unless reused 3+ times
- ❌ Don't add props "just in case" (YAGNI)
- ❌ Don't over-engineer error handling

### File Upload
- Validate file types: use `fileUtils.ts`
- Show upload progress
- Handle errors gracefully
- Clear file input after upload

### 3D Rendering
- Always wrap Three.js components in `<Suspense>`
- Dispose of geometries and materials on unmount
- Use `<LoadingPlaceholder>` for loading states
- Optimize for performance (avoid re-renders)

### State Management
- URL state for tabs and navigation
- Context for truly global state
- Local state for component-specific data
- Don't lift state prematurely

## Common Patterns

### Drag and Drop Upload
```typescript
import { useDragAndDrop } from './hooks/useDragAndDrop'

function Component() {
  const { onDrop, onDragOver } = useDragAndDrop(handleFiles)
  
  return (
    <div onDrop={onDrop} onDragOver={onDragOver}>
      Drop files here
    </div>
  )
}
```

### Loading States
```typescript
function Component() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  
  useEffect(() => {
    setLoading(true)
    ApiClient.getData()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])
  
  if (loading) return <LoadingPlaceholder />
  return <div>{data}</div>
}
```

### Error Handling
```typescript
function Component() {
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    ApiClient.getData()
      .catch(err => setError(err.message))
  }, [])
  
  if (error) return <div className="error">{error}</div>
  return <div>Content</div>
}
```

## Debugging

### Browser DevTools
- React DevTools extension
- Three.js Inspector (r3f-perf)

### Logging
```typescript
// Development only
if (import.meta.env.DEV) {
  console.log('Debug info:', data)
}
```

### Common Issues

**Models not loading**
- Check file format is supported
- Verify API is running
- Check browser console for errors
- Test with `docs/sample-cube.obj`

**Thumbnails not showing**
- Check thumbnail status: `ApiClient.getThumbnailStatus()`
- Verify worker service is running
- Check Network tab for API calls

**Build errors**
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npm run type-check`
- Verify all imports are correct

## Documentation

### Component Documentation
Detailed component docs in `docs/frontend/components/`:
- DockPanel, ModelList, Scene, ThumbnailDisplay, etc.

### Hooks Documentation
Hook docs in `docs/frontend/hooks/`:
- useFileUpload, useTabContext, useTexturePacks, etc.

### Architecture
See `docs/frontend/ARCHITECTURE.md` for design patterns and best practices

### Getting Started Guide
See `docs/frontend/GETTING_STARTED.md` for comprehensive setup and examples

## Related Documentation

- **Project README:** `README.md` - Full application setup
- **Backend API:** `docs/BACKEND_API.md` - API reference
- **Worker Service:** `docs/WORKER.md` - Thumbnail worker
- **Storybook:** Run `npm run storybook` for live component docs
