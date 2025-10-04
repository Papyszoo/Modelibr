# DockPanel

Tabbed panel component with drag-and-drop tab management and content rendering.

## Purpose

Provides a flexible dock panel with:
- Tab bar with draggable tabs
- Dynamic content area
- Empty state when no tabs
- Cross-panel tab dragging
- Add tab functionality

## Import

```typescript
import DockPanel from '../components/layout/DockPanel'
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `side` | `'left' \| 'right'` | Panel side identifier |
| `tabs` | `Tab[]` | Array of tabs to display |
| `setTabs` | `(tabs: Tab[]) => void` | Update tabs array |
| `activeTab` | `string` | Currently active tab ID |
| `setActiveTab` | `(tabId: string) => void` | Set active tab |
| `otherTabs` | `Tab[]` | Tabs from the other panel |
| `setOtherTabs` | `(tabs: Tab[]) => void` | Update other panel's tabs |
| `otherActiveTab` | `string` | Active tab in other panel |
| `setOtherActiveTab` | `(tabId: string) => void` | Set active tab in other panel |
| `draggedTab` | `Tab \| null` | Currently dragged tab |
| `setDraggedTab` | `(tab: Tab \| null) => void` | Set dragged tab |
| `moveTabBetweenPanels` | `(tab: Tab, fromSide) => void` | Move tab between panels |

## Usage Example

```typescript
import DockPanel from '../components/layout/DockPanel'

function SplitterLayout() {
  const [leftTabs, setLeftTabs] = useState([...])
  const [rightTabs, setRightTabs] = useState([...])
  const [activeLeft, setActiveLeft] = useState('')
  const [activeRight, setActiveRight] = useState('')
  const [draggedTab, setDraggedTab] = useState(null)

  const moveTabBetweenPanels = (tab, fromSide) => {
    // Implementation
  }

  return (
    <>
      <DockPanel
        side="left"
        tabs={leftTabs}
        setTabs={setLeftTabs}
        activeTab={activeLeft}
        setActiveTab={setActiveLeft}
        otherTabs={rightTabs}
        setOtherTabs={setRightTabs}
        otherActiveTab={activeRight}
        setOtherActiveTab={setActiveRight}
        draggedTab={draggedTab}
        setDraggedTab={setDraggedTab}
        moveTabBetweenPanels={moveTabBetweenPanels}
      />
      
      <DockPanel
        side="right"
        tabs={rightTabs}
        setTabs={setRightTabs}
        activeTab={activeRight}
        setActiveTab={setActiveRight}
        otherTabs={leftTabs}
        setOtherTabs={setLeftTabs}
        otherActiveTab={activeLeft}
        setOtherActiveTab={setActiveLeft}
        draggedTab={draggedTab}
        setDraggedTab={setDraggedTab}
        moveTabBetweenPanels={moveTabBetweenPanels}
      />
    </>
  )
}
```

## Structure

The panel consists of three main parts:

### 1. DockBar
Tab bar with tab buttons and controls

### 2. DockContentArea
Content area that renders the active tab

### 3. DockEmptyState
Shown when there are no tabs

## Tab Operations

### Add Tab

```typescript
const addTab = () => {
  const newTab: Tab = {
    id: `tab-${Date.now()}`,
    type: 'modelList',
    label: 'New Tab'
  }
  setTabs([...tabs, newTab])
  setActiveTab(newTab.id)
}
```

### Close Tab

```typescript
const closeTab = (tabId: string) => {
  const newTabs = tabs.filter(t => t.id !== tabId)
  setTabs(newTabs)
  
  if (activeTab === tabId && newTabs.length > 0) {
    setActiveTab(newTabs[0].id)
  }
}
```

### Drag Tab

```typescript
const handleTabDragStart = (tab: Tab) => {
  setDraggedTab(tab)
}

const handleTabDragEnd = () => {
  setDraggedTab(null)
}
```

## Drag and Drop

### Drop on Other Panel

When a tab is dragged to the other panel:

```typescript
const handleDropOnOtherPanel = (e: React.DragEvent) => {
  e.preventDefault()
  if (draggedTab) {
    moveTabBetweenPanels(draggedTab, side)
  }
}
```

### Visual Feedback

```typescript
const [isDragOver, setIsDragOver] = useState(false)

const handleDragEnter = () => setIsDragOver(true)
const handleDragLeave = () => setIsDragOver(false)

// Apply class for visual feedback
<div className={isDragOver ? 'drag-over' : ''}>
```

## TabContext Integration

The panel provides TabContext to its children:

```typescript
<TabProvider
  side={side}
  tabs={tabs}
  setTabs={setTabs}
  activeTab={activeTab}
  setActiveTab={setActiveTab}
>
  {children}
</TabProvider>
```

## Empty State

When no tabs exist, shows empty state:

```typescript
{tabs.length === 0 ? (
  <DockEmptyState side={side} onAddTab={addTab} />
) : (
  <DockContentArea 
    activeTab={activeTab}
    {...dragHandlers}
  />
)}
```

## CSS Classes

| Class | Description |
|-------|-------------|
| `dock-panel` | Container element |
| `dock-panel-left` | Left panel specific styles |
| `dock-panel-right` | Right panel specific styles |
| `drag-over` | Applied during drag over |

## Related

- [DockBar](./dock-panel/DockBar.md) - Tab bar component
- [DockContentArea](./dock-panel/DockContentArea.md) - Content renderer
- [DockEmptyState](./dock-panel/DockEmptyState.md) - Empty state
- [DraggableTab](./DraggableTab.md) - Individual tab component
- [TabContext](../contexts/TabContext.md) - Tab context
- [SplitterLayout](./SplitterLayout.md) - Parent layout
