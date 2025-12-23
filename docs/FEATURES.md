# Application Features

This document provides a comprehensive overview of the features in Modelibr, grouped by functional area.

## 1. Layout & Navigation
The application uses a flexible, dockable interface to manage multitasking.
- **Splitter Layout**: Resizable left and right panels.
- **Dockable Tabs**: Open multiple tools simultaneously (e.g., Model List on the left, 3D Viewer on the right).
- **Tab Management**: Drag and drop tabs between panels, close tabs, and restore recently closed tabs.
- **URL State**: Tab configuration is synced with the URL for easy sharing and navigation.

**How to Access:**
- **Add Tabs**: Click the **(+)** button in the top-left or top-right dock bar to open the menu. Select a tool (e.g., "Models", "Texture Sets") to open it in that panel.
- **Move Tabs**: Click and drag a tab header to move it between the left and right panels.
- **Resize Panels**: Drag the vertical divider between the left and right panels.

## 2. Model Library (Models)
The central hub for managing 3D assets.
- **Asset List**: View all uploaded models in a responsive grid.
- **Drag-and-Drop Upload**: Upload files directly by dragging them onto the interface. Supports OBJ, FBX, GLTF, GLB.
- **Thumbnails**: Animated 360° thumbnails generated automatically.
- **Selection**: Multi-select models for batch operations (drag to Projects/Packs).
- **Filtering & Search**: Search models by name.

**How to Access:**
- Open the **Models List** tab from the **(+)** menu.
- **Upload**: Drag 3D files from your computer and drop them anywhere on the Model List area.
- **View Details**: Click on a model card to open the **3D Viewer** for that model.
- **Context Menu**: Right-click a model card to access actions like "Add to pack" or "Recycle".

## 3. 3D Viewer
Interactive inspection of 3D models.
- **Orbit Controls**: Rotate, zoom, and pan around the model.
- **Environment & Lighting**: Adjustable lighting setups and HDR environments.
- **Model Hierarchy**: View the internal structure of the model (nodes, meshes).
- **Model Info**: Display metadata like vertex count, materials, and file size.
- **Preview Settings**: Toggles for wireframe, grid, axes, and more.

**How to Access:**
- Click on any model in the **Model Library**. The viewer opens in a new tab (usually on the opposite panel).
- **Controls**:
  - **Rotate**: Left-click + drag.
  - **Pan**: Right-click + drag.
  - **Zoom**: Scroll wheel.

## 4. Texture Sets
Manage PBR material collections.
- **Texture Management**: Create sets grouping Albedo, Normal, Metallic, Roughness, AO, Emissive, Height, and Opacity textures.
- **Interactive Preview**: Visualize materials on standard primitives (Sphere, Cube, Plane, etc.).
- **Model Association**: Link texture sets to specific models.
- **CRUD**: Create, update, and delete texture sets.

**How to Access:**
- Open the **Texture Sets** tab from the **(+)** menu.
- **Create**: Click the **"New Set"** button or drag an image file onto the list to automatically create a new set.
- **View/Edit**: Click on a texture set card to open the **Texture Set Viewer**.

## 5. Sprites
Manage 2D assets and animations.
- **Format Support**: Static images, GIFs, Sprite Sheets, APNG, Animated WebP.
- **Categorization**: Organize sprites into custom categories via drag-and-drop.
- **Grid View**: Visual browser with thumbnails.
- **Selection**: Area selection tool for bulk management.
- **Preview**: Detail modal with download capability.

**How to Access:**
- Open the **Sprites** tab from the **(+)** menu.
- **Upload**: Drag image files onto the sprite grid.
- **Categorize**: Create categories using the **"Add Category"** button. Drag sprites from the "Unassigned" tab to a category tab.
- **Selection**: Click and drag on the background to draw a selection box around multiple sprites.

## 6. Organization (Projects & Packs)
Tools for grouping and distributing assets.
- **Projects**: Group related models and textures (e.g., for a specific game level).
- **Packs**: Bundle assets for distribution or export.
- **List & Detail Views**: specialized views for managing these collections.

**How to Access:**
- Open **Projects** or **Packs** from the **(+)** menu.
- **Add to Pack/Project**: From the Model List, select models and drag them into a project/pack, or use the right-click context menu on a model.

## 7. Stage Editor (Scene Editor)
Create and save reusable scene configurations.
- **Scene Composition**: Add and position Lights (Directional, Point, Spot, Hemisphere) and Meshes (Plane, Box, Sphere).
- **Helpers**: Visual helpers for lights and grids.
- **Property Panel**: Fine-tune object properties (color, intensity, position, rotation, scale).
- **Hierarchy**: Manage the scene graph of the stage.

**How to Access:**
- Open the **Stages** tab from the **(+)** menu.
- **Create**: Click **"New Stage"** to start a fresh scene.
- **Edit**: Click on a stage to open the **Stage Editor**. Use the toolbar within the editor to add lights and meshes.

## 8. Recycled Files
Safety net for deleted content.
- **Trash Bin**: Stores deleted Models, Model Versions, and Texture Sets.
- **Restore**: Recover items to their original location.
- **Permanent Delete**: Permanently remove items, with a preview of all related files that will be destroyed.

**How to Access:**
- Open the **Recycled Files** tab from the **(+)** menu.
- **Restore**: Click the green "Restore" button on an item card.
- **Delete Forever**: Click the red "Delete" button. A confirmation dialog will show exactly which files will be removed from disk.

## 9. System & Settings
- **History**: View a log of recent uploads and their status.
- **Settings**: Application-wide preferences (e.g., Theme).

**How to Access:**
- Open **History** or **Settings** from the **(+)** menu.

## 10. Backend & Infrastructure
Underlying capabilities powering the frontend.
- **Thumbnail Worker**: Background service for generating static and animated thumbnails.
- **Deduplication**: content-addressable storage ensures identical files are stored only once.
- **SignalR**: Real-time updates for processing jobs (thumbnails, uploads).

**How to Access:**
- These features operate automatically in the background. Status updates (e.g., thumbnail generation progress) appear in real-time on Model cards and in the History tab.
