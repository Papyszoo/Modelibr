# SplitterLayout

Main application layout component with resizable horizontal panels and drag-and-drop tab management.

## Purpose

Provides the main application layout with:
- Resizable left and right panels
- Tab management with URL state persistence
- Cross-panel tab dragging
- Responsive splitter controls
- URL query parameter synchronization

## Import

```typescript
import SplitterLayout from '../components/layout/SplitterLayout'
```

## Features

### Resizable Panels

- Horizontal splitter between left and right panels
- Minimum panel size: 20%
- Persisted splitter position in URL
- Visual resize indicator (4px bar)

### Tab Management

- Independent tab arrays for each panel
- URL state persistence for tabs
- Active tab tracking per panel
- Cross-panel tab dragging

### URL State Synchronization

All layout state is synchronized to URL query parameters:
- `split` - Splitter position (percentage)
- `leftTabs` - Left panel tabs (compact format)
- `rightTabs` - Right panel tabs (compact format)
- `activeLeft` - Active left tab ID
- `activeRight` - Active right tab ID

## State Management

### Splitter Size

```typescript
const [splitterSize, setSplitterSize] = useQueryState('split', {
  defaultValue: '50',
  parse: value => value || '50',
  serialize: value => value,
})
```

### Left Panel Tabs

```typescript
const [leftTabs, setLeftTabs] = useQueryState('leftTabs', {
  defaultValue: [{ id: 'models', type: 'modelList' }] as Tab[],
  parse: (value): Tab[] =>
    parseCompactTabFormat(value, [{ id: 'models', type: 'modelList' }]),
  serialize: serializeToCompactFormat,
})
```

### Right Panel Tabs

```typescript
const [rightTabs, setRightTabs] = useQueryState('rightTabs', {
  defaultValue: [] as Tab[],
  parse: parseCompactTabFormat,
  serialize: serializeToCompactFormat,
})
```

## Usage Example

### Basic Usage

```typescript
import SplitterLayout from '../components/layout/SplitterLayout'

function App() {
  return (
    <div className="app">
      <SplitterLayout />
    </div>
  )
}
```

### With URL State

The component automatically manages URL state:

```
# Initial URL
/?split=50&leftTabs=modelList&rightTabs=

# After resizing to 70% left panel
/?split=70&leftTabs=modelList&rightTabs=

# After opening model viewer in right panel
/?split=70&leftTabs=modelList&rightTabs=modelViewer:123&activeRight=model-123
```

## Tab Format

Tabs are serialized to a compact URL format:

### Compact Format

```
type[:modelId][,type[:modelId]...]
```

### Examples

| Tabs | Compact Format |
|------|---------------|
| Model List | `modelList` |
| Model List + Textures | `modelList,texture` |
| Model Viewer for model 5 | `modelViewer:5` |
| Multiple tabs | `modelList,modelViewer:5,texture` |

## Drag and Drop

### Cross-Panel Tab Dragging

```typescript
const [draggedTab, setDraggedTab] = useState<Tab | null>(null)

const moveTabBetweenPanels = (tab: Tab, fromSide: 'left' | 'right') => {
  if (fromSide === 'left') {
    // Move from left to right
    const newLeftTabs = leftTabs.filter(t => t.id !== tab.id)
    const newRightTabs = [...rightTabs, tab]
    setLeftTabs(newLeftTabs)
    setRightTabs(newRightTabs)
    setActiveRightTab(tab.id)
  } else {
    // Move from right to left
    const newRightTabs = rightTabs.filter(t => t.id !== tab.id)
    const newLeftTabs = [...leftTabs, tab]
    setRightTabs(newRightTabs)
    setLeftTabs(newLeftTabs)
    setActiveLeftTab(tab.id)
  }
  setDraggedTab(null)
}
```

### Drag States

1. **Start Drag**: Tab is picked up, `draggedTab` is set
2. **Dragging**: Tab appears translucent, target panel highlights
3. **Drop**: Tab moves to new panel, becomes active
4. **Cancel**: Tab returns to original position

## Splitter Events

### Resize Handler

```typescript
const handleSplitterResize = (event: SplitterEvent) => {
  const newSize = event.sizes[0].toString()
  setSplitterSize(newSize)
}
```

### Size Calculation

```typescript
const leftSize = parseInt(splitterSize, 10)
const rightSize = 100 - leftSize
```

## Panel Structure

```typescript
<div className="splitter-layout">
  <Splitter
    layout="horizontal"
    onResize={handleSplitterResize}
    resizerStyle={{ background: '#e2e8f0', width: '4px' }}
  >
    <SplitterPanel size={leftSize} minSize={20}>
      <DockPanel side="left" {...leftPanelProps} />
    </SplitterPanel>
    
    <SplitterPanel size={rightSize} minSize={20}>
      <DockPanel side="right" {...rightPanelProps} />
    </SplitterPanel>
  </Splitter>
</div>
```

## Complete Example with Features

```typescript
import { useState } from 'react'
import { useQueryState } from 'nuqs'
import SplitterLayout from '../components/layout/SplitterLayout'

function MainLayout() {
  return (
    <div className="main-layout">
      <header>
        <h1>Modelibr</h1>
      </header>
      
      <main>
        <SplitterLayout />
      </main>
      
      <footer>
        <p>3D Model Viewer</p>
      </footer>
    </div>
  )
}

export default MainLayout
```

## Panel Configuration

### Default Layout

- **Left Panel**: Model list (default tab)
- **Right Panel**: Empty (no tabs)
- **Splitter**: 50/50 split

### Typical Workflows

#### View a Model

1. Model list in left panel
2. Click model → Opens viewer in right panel
3. Split remains 50/50

#### Multi-Model Comparison

1. Model list in left panel (30%)
2. Multiple model viewers in right panel (70%)
3. Tab between different models

#### Texture Work

1. Model viewer in left panel
2. Texture list in right panel
3. Edit textures while viewing model

## Keyboard Navigation

The component supports keyboard navigation through DockPanel:

- **Tab**: Navigate between tabs
- **Enter**: Activate tab
- **Escape**: Close tab (if supported)

## Responsive Behavior

### Minimum Sizes

```typescript
<SplitterPanel size={leftSize} minSize={20}>
  {/* Left panel content */}
</SplitterPanel>
```

- Minimum panel width: 20% of viewport
- Prevents panels from becoming unusable
- Ensures splitter is always accessible

### Visual Feedback

```css
.splitter-layout .p-splitter-gutter {
  background: #e2e8f0;
  width: 4px;
  cursor: col-resize;
}

.splitter-layout .p-splitter-gutter:hover {
  background: #cbd5e1;
}
```

## State Persistence

### URL Parameters

All state is automatically persisted to URL:

```typescript
// Reading from URL
const searchParams = new URLSearchParams(window.location.search)
const split = searchParams.get('split') // "70"
const leftTabs = searchParams.get('leftTabs') // "modelList,texture"

// Writing to URL
setSplitterSize('70') // Updates URL automatically
setLeftTabs([...]) // Updates URL automatically
```

### Shareable Links

Users can share their exact layout:

```
https://app.modelibr.com/?split=70&leftTabs=modelList&rightTabs=modelViewer:123,texture&activeRight=model-123
```

## Panel Props Passed to DockPanel

```typescript
interface DockPanelPropsFromSplitter {
  side: 'left' | 'right'
  tabs: Tab[]
  setTabs: (tabs: Tab[]) => void
  activeTab: string
  setActiveTab: (tabId: string) => void
  otherTabs: Tab[]
  setOtherTabs: (tabs: Tab[]) => void
  otherActiveTab: string
  setOtherActiveTab: (tabId: string) => void
  draggedTab: Tab | null
  setDraggedTab: (tab: Tab | null) => void
  moveTabBetweenPanels: (tab: Tab, fromSide: 'left' | 'right') => void
}
```

## CSS Structure

```css
.splitter-layout {
  height: 100vh;
  width: 100%;
}

.dock-panel-left {
  /* Left panel specific styles */
}

.dock-panel-right {
  /* Right panel specific styles */
}
```

## Related

- [DockPanel](./DockPanel.md) - Panel component
- [TabContent](./TabContent.md) - Tab content renderer
- [DraggableTab](./DraggableTab.md) - Draggable tab component
- [tabSerialization](../utils/tabSerialization.md) - Tab URL serialization
