# Texture Set Merge Feature - User Interaction Flow

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Texture Set Grid                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Set A  │  │   Set B  │  │   Set C  │  │   Set D  │       │
│  │ (Albedo) │  │ (Normal) │  │ (Rough.) │  │  (None)  │       │
│  │  Drag Me │  │          │  │          │  │          │       │
│  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘       │
│       │                                                          │
└───────┼──────────────────────────────────────────────────────────┘
        │
        │  1. User grabs Set A and starts dragging
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Texture Set Grid                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │          │  │   Set B  │  │   Set C  │  │   Set D  │       │
│  │ [Dragging]  │ ◄────────┼─ │  Hover   │  │          │       │
│  │          │  │ Highlight│  │          │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                     │                                            │
└─────────────────────┼────────────────────────────────────────────┘
                      │
                      │  2. Hovers over Set B (target highlights)
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                Merge Texture Set Dialog                          │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ Merge Texture Sets                                      [X] ┃ │
│ ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫ │
│ ┃                                                             ┃ │
│ ┃  ℹ️  You are merging the Albedo texture from               ┃ │
│ ┃     "Set A" into "Set B".                                  ┃ │
│ ┃                                                             ┃ │
│ ┃  Select which texture type to add it as:                   ┃ │
│ ┃                                                             ┃ │
│ ┃  Texture Type:                                             ┃ │
│ ┃  ┌──────────────────────────────────────┐                 ┃ │
│ ┃  │ Select a texture type         ▼      │                 ┃ │
│ ┃  └──────────────────────────────────────┘                 ┃ │
│ ┃                                                             ┃ │
│ ┃  Available options:                                        ┃ │
│ ┃  • Albedo (Base color)                                     ┃ │
│ ┃  • Height (Displacement)                                   ┃ │
│ ┃  • AO (Ambient Occlusion)                                  ┃ │
│ ┃  • Roughness                                               ┃ │
│ ┃  • Metallic                                                ┃ │
│ ┃  • Diffuse                                                 ┃ │
│ ┃  • Specular                                                ┃ │
│ ┃                                                             ┃ │
│ ┃  Note: "Normal" is grayed out (already exists in Set B)   ┃ │
│ ┃                                                             ┃ │
│ ┃                        [ Cancel ]  [ Merge ]               ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
└─────────────────────────────────────────────────────────────────┘
                      │
                      │  3. User selects "Roughness" and clicks Merge
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Success Toast                                 │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ ✓ Success                                           │        │
│  │   Texture merged successfully as Roughness          │        │
│  └─────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                      │
                      │  4. Texture set list refreshes
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Updated Texture Set Grid                      │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Set A  │  │   Set B  │  │   Set C  │  │   Set D  │       │
│  │ (Albedo) │  │ (Normal, │  │ (Rough.) │  │  (None)  │       │
│  │          │  │Roughness)│  │          │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                     ▲                                            │
│                     │                                            │
│                 Now has both                                     │
│                Normal + Roughness                                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### Visual Feedback
- **Dragging**: Card becomes semi-transparent while being dragged
- **Hover**: Target card gets a blue border and scales slightly (1.02x)
- **Drop**: Border highlight and opacity change on target card

### Validation
1. ✅ Cannot drop on self (shows warning toast)
2. ✅ Source must have Albedo texture (shows warning if missing)
3. ✅ Only shows available texture types in dropdown
4. ✅ Shows info message if all types are filled in target

### API Integration
- Uses existing endpoint: `POST /texture-sets/{id}/textures`
- Request: `{ fileId: <albedo_texture_file_id>, textureType: <selected_type> }`
- Response: Success/Error handled with toast notifications

## Code Structure

```
src/frontend/src/features/texture-set/
├── components/
│   ├── TextureSetGrid.tsx          # Main grid with drag-drop logic
│   └── TextureSetGrid.css          # Styling with drag feedback
├── dialogs/
│   ├── MergeTextureSetDialog.tsx   # Merge modal component
│   └── dialogs.css                 # Modal styling
```

## Example Usage Scenarios

### Scenario 1: Merging Wood Textures
```
Source: "Wood_Pack_01" (has Albedo only)
Target: "Wood_Pack_Complete" (has Normal, Height, AO)

Action: Drag Wood_Pack_01 onto Wood_Pack_Complete
Result: Select texture type → Choose "Albedo"
Outcome: Wood_Pack_Complete now has 4 textures
```

### Scenario 2: Building Complete Material
```
Source: "Metal_Albedo" (has Albedo)
Target: "Metal_Complete" (empty)

Step 1: Drag Metal_Albedo → Add as "Albedo"
Step 2: Drag Metal_Normal → Add as "Normal"
Step 3: Drag Metal_Roughness → Add as "Roughness"
Result: Complete metal material with 3 textures
```

## Technical Details

### Drag Data Transfer
```typescript
// Set custom data to distinguish from file drops
e.dataTransfer.setData('application/x-texture-set-id', textureSet.id.toString())

// Check if it's a texture set (not a file)
if (e.dataTransfer.types.includes('application/x-texture-set-id')) {
  // Handle texture set drop
}
```

### State Management
```typescript
const [draggedTextureSet, setDraggedTextureSet] = useState<TextureSetDto | null>(null)
const [dropTargetTextureSet, setDropTargetTextureSet] = useState<TextureSetDto | null>(null)
const [dragOverCardId, setDragOverCardId] = useState<number | null>(null)
const [showMergeDialog, setShowMergeDialog] = useState(false)
```

### Available Texture Type Filtering
```typescript
const existingTypes = targetTextureSet.textures?.map(t => t.textureType) || []
const allTypes = [TextureType.Albedo, TextureType.Normal, ...]
const availableTypes = allTypes.filter(type => !existingTypes.includes(type))
```
