# Texture Pack Geometry Preview Feature

## Overview

The Texture Pack Geometry Preview feature allows users to visualize how texture packs look when applied to 3D geometries. This is accessible from the Texture Pack Viewer page.

## Components

### GeometrySelector

Located at: `src/frontend/src/components/tabs/texture-pack-viewer/GeometrySelector.tsx`

A component that displays buttons for selecting different 3D geometries to preview textures on.

**Props:**
- `onGeometrySelect: (geometry: GeometryType) => void` - Callback when a geometry is selected

**Geometry Types:**
- `box` - Cube geometry
- `sphere` - Sphere geometry
- `cylinder` - Cylinder geometry
- `torus` - Torus geometry

**Usage:**
```tsx
<GeometrySelector onGeometrySelect={(geometry) => setSelectedGeometry(geometry)} />
```

### TexturedGeometry

Located at: `src/frontend/src/components/tabs/texture-pack-viewer/TexturedGeometry.tsx`

A Three.js component that renders a 3D geometry with textures from a texture pack applied.

**Props:**
- `geometryType: GeometryType` - The type of geometry to render
- `texturePack: TexturePackDto` - The texture pack containing textures to apply

**Texture Mapping:**
- Albedo/Diffuse → Base color map
- Normal → Normal map for surface details
- Roughness → Roughness map
- Metallic → Metalness map
- AO (Ambient Occlusion) → AO map

**Features:**
- Auto-rotation for better visualization
- Proper texture wrapping
- PBR (Physically Based Rendering) material support
- Fallback to white material when no textures are available

### TexturePreviewDialog

Located at: `src/frontend/src/components/tabs/texture-pack-viewer/TexturePreviewDialog.tsx`

A modal dialog that displays a 3D preview of textures applied to a selected geometry.

**Props:**
- `visible: boolean` - Controls dialog visibility
- `geometryType: GeometryType` - The geometry to render
- `texturePack: TexturePackDto` - The texture pack to apply
- `onHide: () => void` - Callback when dialog is closed

**Features:**
- Full 3D scene with lighting
- Interactive orbit controls (rotate, zoom, pan)
- Ground plane with shadows
- Maximizable dialog
- Displays texture count

## Integration

The GeometrySelector is integrated into the TexturePackViewer component and appears below the texture cards grid when the pack has at least one texture.

**Location in TexturePackViewer:**
```tsx
<TabPanel header="Textures" leftIcon="pi pi-image">
  <div className="texture-cards-grid">
    {/* Texture cards */}
  </div>
  
  {texturePack.textureCount > 0 && (
    <GeometrySelector onGeometrySelect={handleGeometrySelect} />
  )}
</TabPanel>
```

## User Flow

1. User opens a texture pack in the Texture Pack Viewer
2. User sees texture cards showing individual textures
3. Below the texture cards, the GeometrySelector appears (if pack has textures)
4. User clicks on a geometry button (Cube, Sphere, Cylinder, or Torus)
5. TexturePreviewDialog opens showing the selected geometry with textures applied
6. User can interact with the 3D view using mouse controls:
   - Left click + drag: Rotate
   - Right click + drag: Pan
   - Scroll wheel: Zoom
7. User can maximize the dialog for a larger view
8. User closes the dialog to return to the texture pack view

## Styling

- **GeometrySelector.css** - Styles for the geometry selector component
- **TexturePreviewDialog.css** - Styles for the preview dialog

The design follows the application's existing design system with:
- PrimeReact button styling
- Consistent color scheme (blue accents)
- Responsive layout
- Hover effects for better UX

## Testing

Tests are located in:
- `src/frontend/src/components/__tests__/GeometrySelector.test.tsx`
- `src/frontend/src/components/__tests__/TexturedGeometry.test.tsx`

Run tests with:
```bash
npm test
```

## Storybook Stories

Stories for visual development and documentation:
- `src/frontend/src/stories/GeometrySelector.stories.ts`
- `src/frontend/src/stories/TexturePreviewDialog.stories.tsx`

Run Storybook with:
```bash
npm run storybook
```

## Screenshots

### Geometry Selector Component
![Geometry Selector](https://github.com/user-attachments/assets/6d81f06a-09c5-4ad1-aeb5-41f4188fe308)

The geometry selector displays four buttons for different 3D shapes, each with an icon and label.

### Geometry Selector in Action
![Geometry Selector Story](https://github.com/user-attachments/assets/89ce0185-7061-4ee2-ba52-fbc4c468d225)

The interactive component allows users to select which geometry to preview with the texture pack.
