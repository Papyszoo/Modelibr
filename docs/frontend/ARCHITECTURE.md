# Frontend Architecture Overview

This document provides a high-level overview of the Modelibr frontend architecture, design patterns, and key concepts.

## Technology Stack

### Core Technologies

- **React 18** - UI library with hooks and concurrent features
- **TypeScript** - Type-safe JavaScript
- **Three.js** - 3D graphics library
- **@react-three/fiber** - React renderer for Three.js
- **@react-three/drei** - Useful helpers for Three.js

### UI Libraries

- **PrimeReact** - Component library for data tables, dialogs, forms
- **PrimeIcons** - Icon library
- **nuqs** - Type-safe URL state management

### Real-time Communication

- **@microsoft/signalr** - Real-time updates for thumbnails
- **Axios** - HTTP client for API communication

## Application Architecture

### Component Hierarchy

```
App
├── SplitterLayout (main layout)
│   ├── DockPanel (left)
│   │   ├── DockBar (tabs)
│   │   └── DockContentArea
│   │       ├── ModelList
│   │       ├── ModelViewer
│   │       ├── TextureList
│   │       └── AnimationList
│   └── DockPanel (right)
│       └── (same structure)
```

### State Management

#### Local State (useState)
- Component-specific state
- Form inputs
- UI toggles

#### URL State (nuqs)
- Tab configuration
- Splitter position
- Active tabs
- Shareable layouts

#### Context (React Context)
- Tab management (TabContext)
- Cross-component coordination

#### Server State (API Calls)
- Model data
- Texture packs
- File information

### Data Flow

```
User Action
    ↓
Event Handler
    ↓
State Update / API Call
    ↓
Re-render / Real-time Update
    ↓
UI Update
```

## Design Patterns

### 1. Hooks Pattern

All stateful logic is encapsulated in custom hooks:

```typescript
// File upload logic
const { uploading, uploadFile } = useFileUpload()

// Direct API calls for simple operations
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
const { openTab, openModelDetailsTab } = useTabContext()
```

### 2. Component Composition

Components are composed from smaller, reusable pieces:

```typescript
<ModelList>
  <ModelListHeader />
  <UploadProgress />
  <LoadingState />
  <ErrorState />
  <ModelGrid />
</ModelList>
```

### 3. Render Props & Context

Context provides shared state without prop drilling:

```typescript
<TabProvider value={tabContext}>
  <DockBar />      {/* Uses tabContext */}
  <TabContent />   {/* Uses tabContext */}
</TabProvider>
```

### 4. Container/Presenter Pattern

Separation of logic and presentation:

```typescript
// Container: Logic
function ModelListContent({ tabContext }) {
  const [models, setModels] = useState([])
  // ... business logic
  
  return <ModelGrid models={models} />
}

// Presenter: UI
function ModelGrid({ models }) {
  return (
    <div className="model-grid">
      {models.map(model => (
        <div key={model.id} className="model-card">
          <ThumbnailDisplay modelId={model.id} />
          <span>{model.name}</span>
        </div>
      ))}
    </div>
  )
}
```

### 5. Suspense & Lazy Loading

Async components with loading states:

```typescript
<Suspense fallback={<LoadingPlaceholder />}>
  <Model modelUrl={url} />
</Suspense>
```

## Key Features Implementation

### 1. URL-Persisted Layout

Tabs and layout stored in URL:

```
/?split=70&leftTabs=modelList,texture&rightTabs=modelViewer:123&activeRight=model-123
```

**Benefits:**
- Shareable links
- Browser history integration
- Persistent state across refreshes

### 2. Drag and Drop

**File Upload:**
- Global drag prevention
- Drop zones in tables and empty states
- Visual feedback

**Tab Dragging:**
- Cross-panel tab movement
- Drag state management
- Automatic cleanup

### 3. Real-time Updates

**SignalR Integration:**
- Thumbnail status updates
- Automatic reconnection
- Fallback to polling

### 4. 3D Model Rendering

**Three.js Pipeline:**
1. Load model (OBJ/GLTF/GLB)
2. Apply materials
3. Center and scale
4. Add to scene
5. Render with lighting

### 5. Type Safety

**TypeScript Throughout:**
```typescript
interface Model {
  id: string
  name: string
  files: ModelFile[]
  createdAt: string
  updatedAt: string
}
```

## File Organization

```
src/
├── components/          # React components
│   ├── layout/         # Layout components
│   ├── model-list/     # Model list components
│   ├── dialogs/        # Dialog components
│   └── tabs/           # Tab content components
├── hooks/              # Custom React hooks
├── utils/              # Pure utility functions
├── services/           # API clients and services
├── contexts/           # React contexts
└── types/              # TypeScript type definitions
```

### Naming Conventions

- **Components**: PascalCase (e.g., `ModelList.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useFileUpload.ts`)
- **Utils**: camelCase (e.g., `fileUtils.ts`)
- **Types**: PascalCase for interfaces (e.g., `Model`, `Tab`)

## Performance Optimizations

### 1. Code Splitting

```typescript
const TexturePackList = lazy(() => import('./components/tabs/TexturePackList'))
```

### 2. Memoization

```typescript
const MemoizedGrid = memo(ModelGrid)
```

### 3. Grid Optimization

Responsive CSS Grid for model cards:
```typescript
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
}
```

### 4. Efficient Re-renders

```typescript
// Only re-render when dependencies change
useEffect(() => {
  fetchModels()
}, [modelId])

// Prevent unnecessary callbacks
const handleClick = useCallback(() => {
  // ...
}, [deps])
```

### 5. Asset Optimization

- Lazy load 3D models
- Thumbnail compression
- Efficient model formats (GLB over GLTF)

## Error Handling

### 1. Component-Level

```typescript
try {
  await uploadFile(file)
} catch (error) {
  toast.current.show({
    severity: 'error',
    summary: 'Upload Failed',
    detail: error.message
  })
}
```

### 2. Error Boundaries

```typescript
<ErrorBoundary fallback={<ErrorState />}>
  <ModelViewer />
</ErrorBoundary>
```

### 3. API Error Handling

```typescript
if (error.response) {
  // Server error
} else if (error.request) {
  // Network error
} else {
  // Other error
}
```

## Testing Strategy

### Unit Tests

- Hooks testing with `@testing-library/react-hooks`
- Utility functions with Jest
- Component rendering with React Testing Library

### Integration Tests

- User flows (upload → view → edit)
- API integration
- State management

### Example Test Structure

```typescript
describe('useFileUpload', () => {
  it('should upload file successfully', async () => {
    const { result } = renderHook(() => useFileUpload())
    const file = new File(['content'], 'model.obj')
    
    await act(async () => {
      await result.current.uploadFile(file)
    })
    
    expect(result.current.uploading).toBe(false)
  })
})
```

## Security Considerations

### 1. File Upload Validation

```typescript
// Client-side validation
const validFormats = ['.obj', '.gltf', '.glb']
if (!validFormats.includes(extension)) {
  throw new Error('Invalid format')
}
```

### 2. XSS Prevention

- React auto-escapes by default
- Sanitize user input
- Use `dangerouslySetInnerHTML` sparingly

### 3. CORS Configuration

```typescript
// API client with CORS
axios.create({
  baseURL: apiUrl,
  withCredentials: false
})
```

## Future Enhancements

### Planned Features

1. **Offline Support**
   - Service workers
   - IndexedDB caching
   - Offline model viewing

2. **Collaborative Features**
   - Multi-user sessions
   - Real-time collaboration
   - Shared annotations

3. **Advanced Rendering**
   - WebGPU support
   - Ray tracing
   - Advanced materials

4. **Mobile Optimization**
   - Touch controls
   - Responsive 3D viewer
   - Mobile-first UI

## Developer Guidelines

### Adding New Components

1. Create component file in appropriate directory
2. Add TypeScript interfaces for props
3. Document props and usage
4. Add to documentation
5. Write tests

### Adding New Hooks

1. Create hook file in `hooks/`
2. Export hook and any related types
3. Document parameters and return values
4. Add usage examples
5. Write tests

### Adding New Features

1. Plan state management approach
2. Design component hierarchy
3. Implement with TypeScript
4. Add error handling
5. Document and test

## Resources

### Documentation
- [React Documentation](https://react.dev)
- [Three.js Documentation](https://threejs.org/docs)
- [PrimeReact Documentation](https://primereact.org)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

### Internal Docs
- [Hooks Documentation](./hooks/)
- [Components Documentation](./components/)
- [Utilities Documentation](./utils/)
- [Services Documentation](./services/)

## Getting Help

- Check existing documentation
- Review component examples
- Examine test files for usage patterns
- Refer to TypeScript types for interfaces
