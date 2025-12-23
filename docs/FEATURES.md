# Application Features

This document provides a comprehensive overview of the features in Modelibr, grouped by functional area.

## 1. Layout & Navigation
The application uses a flexible, dockable interface to manage multitasking.
- **Splitter Layout**: Resizable left and right panels.
- **Dockable Tabs**: Open multiple tools simultaneously (e.g., Model List on the left, 3D Viewer on the right).
- **Tab Management**: Drag and drop tabs between panels, close tabs, and restore recently closed tabs.
- **URL State**: Tab configuration is synced with the URL for easy sharing and navigation.

## 2. Model Library (Models)
The central hub for managing 3D assets.
- **Asset List**: View all uploaded models in a responsive grid.
- **Drag-and-Drop Upload**: Upload files directly by dragging them onto the interface. Supports OBJ, FBX, GLTF, GLB.
- **Thumbnails**: Animated 360° thumbnails generated automatically.
- **Selection**: Multi-select models for batch operations (drag to Projects/Packs).
- **Filtering & Search**: (Implied capabilities based on UI structure).

## 3. 3D Viewer
Interactive inspection of 3D models.
- **Orbit Controls**: Rotate, zoom, and pan around the model.
- **Environment & Lighting**: Adjustable lighting setups and HDR environments.
- **Model Hierarchy**: View the internal structure of the model (nodes, meshes).
- **Model Info**: Display metadata like vertex count, materials, and file size.
- **Preview Settings**: Toggles for wireframe, grid, axes, and more.

## 4. Texture Sets
Manage PBR material collections.
- **Texture Management**: Create sets grouping Albedo, Normal, Metallic, Roughness, AO, Emissive, Height, and Opacity textures.
- **Interactive Preview**: Visualize materials on standard primitives (Sphere, Cube, Plane, etc.).
- **Model Association**: Link texture sets to specific models.
- **CRUD**: Create, update, and delete texture sets.

## 5. Sprites
Manage 2D assets and animations.
- **Format Support**: Static images, GIFs, Sprite Sheets, APNG, Animated WebP.
- **Categorization**: Organize sprites into custom categories via drag-and-drop.
- **Grid View**: Visual browser with thumbnails.
- **Selection**: Area selection tool for bulk management.
- **Preview**: Detail modal with download capability.

## 6. Organization (Projects & Packs)
Tools for grouping and distributing assets.
- **Projects**: Group related models and textures (e.g., for a specific game level).
- **Packs**: Bundle assets for distribution or export.
- **List & Detail Views**: specialized views for managing these collections.

## 7. Stage Editor (Scene Editor)
Create and save reusable scene configurations.
- **Scene Composition**: Add and position Lights (Directional, Point, Spot, Hemisphere) and Meshes (Plane, Box, Sphere).
- **Helpers**: Visual helpers for lights and grids.
- **Property Panel**: Fine-tune object properties (color, intensity, position, rotation, scale).
- **Hierarchy**: Manage the scene graph of the stage.

## 8. Recycled Files
Safety net for deleted content.
- **Trash Bin**: Stores deleted Models, Model Versions, and Texture Sets.
- **Restore**: Recover items to their original location.
- **Permanent Delete**: Permanently remove items, with a preview of all related files that will be destroyed.

## 9. System & Settings
- **History**: View a log of recent uploads and their status.
- **Settings**: Application-wide preferences (e.g., Theme).

## 10. Backend & Infrastructure
Underlying capabilities powering the frontend.
- **Thumbnail Worker**: Background service for generating static and animated thumbnails.
- **Deduplication**: content-addressable storage ensures identical files are stored only once.
- **SignalR**: Real-time updates for processing jobs (thumbnails, uploads).
