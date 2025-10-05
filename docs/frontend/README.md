# Frontend Documentation

This directory contains comprehensive documentation for all frontend components, hooks, utilities, and services used in the Modelibr application.

## Quick Links

- **[Getting Started Guide](./GETTING_STARTED.md)** - Setup, core concepts, and common tasks
- **[Architecture Overview](./ARCHITECTURE.md)** - Design patterns, state management, and best practices

## Table of Contents

- [Hooks](#hooks)
- [Components](#components)
- [Utilities](#utilities)
- [Services](#services)
- [Contexts](#contexts)

## Architecture Overview

The Modelibr frontend is built with React, TypeScript, and Three.js. It follows a modular architecture with clear separation of concerns:

- **Components**: UI building blocks organized by feature
- **Hooks**: Reusable stateful logic
- **Utilities**: Pure functions for data transformation and validation
- **Services**: API communication and external integrations
- **Contexts**: Global state management

## Hooks

Custom React hooks that encapsulate reusable stateful logic.

- [useFileUpload](./hooks/useFileUpload.md) - File upload handling with validation and progress tracking
- [useTabContext](./hooks/useTabContext.md) - Tab management within the dock panel system
- [useTexturePacks](./hooks/useTexturePacks.md) - Texture pack CRUD operations
- [useGlobalDragPrevention](./hooks/useGlobalDragPrevention.md) - Global drag and drop prevention

## Components

### Layout Components

- [SplitterLayout](./components/SplitterLayout.md) - Main application layout with resizable panels
- [DockPanel](./components/DockPanel.md) - Tabbed panel with drag and drop support
- [TabContent](./components/TabContent.md) - Dynamic tab content renderer
- [DraggableTab](./components/DraggableTab.md) - Draggable tab component

### Model Components

- [ModelViewer](./components/ModelViewer.md) - 3D model viewer with Three.js
- [Scene](./components/Scene.md) - Three.js scene setup with lighting and controls
- [Model](./components/Model.md) - 3D model loader for different formats
- [LoadingPlaceholder](./components/LoadingPlaceholder.md) - 3D loading indicator
- [ModelInfo](./components/ModelInfo.md) - Model metadata display
- [ModelInfoSidebar](./components/ModelInfoSidebar.md) - Sidebar with model information

### Model List Components

- [ModelList](./components/ModelList.md) - Model list with upload functionality
- [ModelsDataTable](./components/ModelsDataTable.md) - PrimeReact data table for models
- [ModelListHeader](./components/ModelListHeader.md) - Model list header with actions
- [EmptyState](./components/EmptyState.md) - Empty state with drag and drop
- [ErrorState](./components/ErrorState.md) - Error state display
- [LoadingState](./components/LoadingState.md) - Loading state indicator
- [UploadProgress](./components/UploadProgress.md) - Upload progress indicator

### Thumbnail Components

- [ThumbnailDisplay](./components/ThumbnailDisplay.md) - Thumbnail display with status management
- [ThumbnailSidebar](./components/ThumbnailSidebar.md) - Sidebar with thumbnail controls

### Dialog Components

- [CreateTexturePackDialog](./components/CreateTexturePackDialog.md) - Create new texture pack
- [TexturePackDetailDialog](./components/TexturePackDetailDialog.md) - View and manage texture pack details
- [AddTextureToPackDialog](./components/AddTextureToPackDialog.md) - Add textures to a pack
- [ModelAssociationDialog](./components/ModelAssociationDialog.md) - Associate models with texture packs

### Tab Components

- [TexturePackList](./components/TexturePackList.md) - List of texture packs
- [TextureList](./components/TextureList.md) - List of textures
- [AnimationList](./components/AnimationList.md) - List of animations

## Utilities

Pure functions for data transformation, validation, and formatting.

- [fileUtils](./utils/fileUtils.md) - File format validation and utilities
- [tabSerialization](./utils/tabSerialization.md) - Tab state serialization for URL persistence
- [textureTypeUtils](./utils/textureTypeUtils.md) - Texture type metadata and helpers
- [webgpu](./utils/webgpu.md) - WebGPU detection and utilities

## Services

External API communication and integrations.

- [ApiClient](./services/ApiClient.md) - RESTful API client for backend communication

## Contexts

React contexts for global state management.

- [TabContext](./contexts/TabContext.md) - Tab management context for dock panels

## Getting Started

To use this documentation:

1. Navigate to the relevant section based on what you're looking for
2. Each document includes:
   - Purpose and responsibilities
   - Parameters and return values
   - Usage examples
   - Related components/hooks

## Contributing

When adding new components or hooks:

1. Create a new markdown file in the appropriate directory
2. Follow the existing documentation format
3. Include examples and parameter descriptions
4. Update this README with a link to the new documentation
