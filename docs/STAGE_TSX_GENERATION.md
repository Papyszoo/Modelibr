# Stage TSX File Generation

This feature allows you to save your stage configurations as reusable TypeScript React components (TSX files).

## Overview

When you create a stage in the visual editor, you can now:
1. Generate a TSX file from your configuration
2. Download the TSX file
3. Use it as a standalone React component in your projects

## How to Use

### 1. Create a Stage
- Use the Stage Editor to add lights and configure your scene
- Click "Save" to save your stage to the database

### 2. Generate TSX File
- Click the "Generate TSX" button in the toolbar
- This creates a TSX file in the backend storage
- A success message confirms the file was created

### 3. Download TSX File
- Click the "Download TSX" button in the toolbar
- The TSX file will be downloaded to your computer
- Use this file in your React Three Fiber projects

## Generated File Structure

The generated TSX file includes:
```typescript
import { JSX, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

type [StageName]Props = {
  children?: ReactNode;
};

function [StageName]({ children }: [StageName]Props): JSX.Element {
  return (
    <Canvas shadows camera={{ position: [10, 10, 10], fov: 50 }}>
      {/* Your configured lights */}
      
      {/* Your 3D objects */}
      {children}
      
      <OrbitControls />
    </Canvas>
  );
}

export default [StageName];
```

## Using the Component

To use the generated component in your project:

```typescript
import MyStage from './MyStage';
import { MyModel } from './models/MyModel';

function App() {
  return (
    <MyStage>
      <MyModel />
    </MyStage>
  );
}
```

## Supported Light Types

The generator supports all React Three Fiber light types:

- **Ambient Light**: Global illumination
- **Directional Light**: Sun-like directional lighting with shadows
- **Point Light**: Omnidirectional light from a point
- **Spot Light**: Cone-shaped light beam with shadows

## API Endpoints

### Generate TSX
```
POST /stages/{id}/generate-tsx
```
Generates and saves a TSX file for the specified stage.

**Response:**
```json
{
  "filePath": "stages/MyStage.tsx",
  "tsxCode": "..."
}
```

### Download TSX
```
GET /stages/{id}/tsx
```
Downloads the TSX file for the specified stage.

**Response:** TSX file download

## File Storage

- TSX files are stored in: `{UPLOAD_STORAGE_PATH}/stages/`
- File names are sanitized to remove invalid characters
- Component names are converted to valid TypeScript identifiers
- Path traversal attacks are prevented through validation

## Security

- Files can only be saved in the designated `/stages` directory
- File paths are validated to prevent directory traversal
- File names are sanitized before storage
- Component names are sanitized for TypeScript compatibility
