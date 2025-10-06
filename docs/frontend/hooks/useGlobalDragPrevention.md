# useGlobalDragPrevention

Custom hook to prevent browser's default drag and drop behavior globally.

## Purpose

Prevents the browser from opening dropped files when they are dragged outside of designated drop zones. This is essential for applications with drag and drop functionality to avoid accidentally navigating away from the application.

## Import

```typescript
import { useGlobalDragPrevention } from '../hooks/useGlobalDragPrevention'
```

## API

### useGlobalDragPrevention()

No parameters required. Simply call the hook to activate global drag prevention.

#### Return Value

This hook doesn't return anything. It sets up global event listeners automatically.

## Usage Examples

### Basic Usage

```typescript
import { useGlobalDragPrevention } from '../hooks/useGlobalDragPrevention'

function App() {
  // Prevent default browser drag behavior globally
  useGlobalDragPrevention()

  return (
    <div>
      <UploadArea />
      <ModelList />
    </div>
  )
}
```

### In Main Application Component

```typescript
import { useGlobalDragPrevention } from '../hooks/useGlobalDragPrevention'

function MainApp() {
  useGlobalDragPrevention()

  return (
    <div className="app">
      <Header />
      <SplitterLayout />
      <Footer />
    </div>
  )
}
```

### With Other Global Hooks

```typescript
import { useGlobalDragPrevention } from '../hooks/useGlobalDragPrevention'
import { useEffect } from 'react'

function RootComponent() {
  useGlobalDragPrevention()

  useEffect(() => {
    // Other global setup
    console.log('App initialized')
  }, [])

  return <AppContent />
}
```

## How It Works

The hook attaches event listeners to the `window` object for:

1. **`dragover` event**: Prevents default to allow drop events to work
2. **`drop` event**: Prevents default to stop browser from opening files

These listeners are added when the component mounts and removed when it unmounts.

## Event Handlers

### handleGlobalDragOver

```typescript
const handleGlobalDragOver = (e: DragEvent): void => {
  e.preventDefault()
}
```

Prevents the default dragover behavior which is necessary for drop events to function properly.

### handleGlobalDrop

```typescript
const handleGlobalDrop = (e: DragEvent): void => {
  e.preventDefault()
}
```

Prevents the browser from navigating to or opening dropped files.

## Lifecycle

```
Component Mount
    ↓
Add window event listeners
    ↓
Listen for dragover/drop events globally
    ↓
Component Unmount
    ↓
Remove window event listeners
```

## Important Notes

### Placement

This hook should be called at a high level in your application, typically in:
- Main App component
- Root layout component
- Application shell

### Interaction with Drop Zones

This hook only prevents **default browser behavior**. Your designated drop zones will still work because:

1. They use `e.stopPropagation()` to prevent events from bubbling
2. They implement their own drop handlers
3. The global prevention only affects areas without explicit drop handlers

### Example with Drop Zone

```typescript
import { useGlobalDragPrevention } from '../hooks/useGlobalDragPrevention'
import { useDragAndDrop } from '../hooks/useFileUpload'

function App() {
  // Prevent default globally
  useGlobalDragPrevention()

  const handleFilesDropped = (files) => {
    console.log('Files dropped:', files)
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } = 
    useDragAndDrop(handleFilesDropped)

  return (
    <div className="app">
      {/* This drop zone still works */}
      <div
        className="drop-zone"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      >
        Drop files here
      </div>

      {/* Rest of the app - drag/drop prevented */}
      <div className="content">...</div>
    </div>
  )
}
```

## Browser Compatibility

Works with all modern browsers that support:
- `window.addEventListener()`
- `DragEvent` API
- Event `preventDefault()`

## Performance

The hook is highly performant:
- Minimal overhead (two simple event listeners)
- Uses passive event listeners where appropriate
- Properly cleaned up on unmount
- No re-renders or state changes

## Debugging

To verify the hook is working:

```typescript
import { useGlobalDragPrevention } from '../hooks/useGlobalDragPrevention'

function App() {
  useGlobalDragPrevention()

  useEffect(() => {
    // Test if listeners are attached
    const testDrop = (e) => {
      console.log('Drop event captured')
    }
    
    window.addEventListener('drop', testDrop)
    
    return () => {
      window.removeEventListener('drop', testDrop)
    }
  }, [])

  return <div>App</div>
}
```

## Common Issues

### Issue: Drop zones not working

**Solution**: Ensure drop zones call `e.stopPropagation()` in their handlers:

```typescript
const onDrop = (e) => {
  e.preventDefault()
  e.stopPropagation() // Important!
  // Handle drop
}
```

### Issue: Files still opening in browser

**Solution**: Verify the hook is called in a component that stays mounted:

```typescript
// ✅ Good - App component stays mounted
function App() {
  useGlobalDragPrevention()
  return <Router />
}

// ❌ Bad - Route component unmounts on navigation
function SomePage() {
  useGlobalDragPrevention()
  return <div>Page</div>
}
```

## Related

- [useDragAndDrop](./useFileUpload.md#usedraganddrop) - Drop zone creation
- [useFileUpload](./useFileUpload.md) - File upload handling
- [EmptyState](../components/EmptyState.md) - Uses drop zones
- [ModelGrid](../components/ModelGrid.md) - Uses drop zones
