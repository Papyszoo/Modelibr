# Scene Editor

A visual 3D scene editor built with Three.js and React Three Fiber for creating and managing lighting configurations.

## Features

### Visual Editor
- **Interactive 3D Canvas**: Real-time preview of your scene with orbit controls
- **Grid Helper**: Visual grid for spatial reference
- **Reference Object**: A sphere to visualize lighting effects
- **Object Selection**: Click on light helpers to select and edit them

### Component Library
Support for four types of lights:
- **Ambient Light**: Global illumination affecting all objects
- **Directional Light**: Parallel light rays (like sunlight)
- **Point Light**: Omnidirectional light from a point
- **Spot Light**: Cone-shaped light beam with angle control

### Property Panel
Edit light properties in real-time:
- **Color**: Visual color picker
- **Intensity**: Brightness control
- **Position**: X, Y, Z coordinates (except ambient)
- **Spot Light Specific**: Angle, penumbra, distance, decay

### Code Generation
Export your scene configuration as React Three Fiber code:
- Generates production-ready JSX code
- Includes all light configurations
- Copy-to-clipboard functionality
- Expandable code panel

### Scene Management
- **New**: Start a fresh scene
- **Save**: Persist scene to database
- **Load**: Browse and load saved scenes
- **Update**: Modify existing scenes

## Usage

### Opening the Scene Editor
1. Click the `+` button in the tab bar
2. Select "Scene Editor" from the menu
3. The editor will open in a new tab

### Creating a Scene
1. Click components from the Light Library to add them
2. Click on light visualizers in the 3D view to select them
3. Adjust properties in the Property Panel
4. Generate code from the Code Panel
5. Save your scene using the toolbar

### Saving a Scene
1. Click the "Save" button in the toolbar
2. Enter a scene name (first save only)
3. Click "Save" to persist to database
4. Subsequent saves update the existing scene

### Loading a Scene
1. Click the "Load" button in the toolbar
2. Browse available scenes
3. Click "Load" on the desired scene
4. The scene configuration will be applied

## API Endpoints

The scene editor uses the following backend endpoints:

- `POST /scenes` - Create a new scene
- `GET /scenes` - Get all scenes
- `GET /scenes/{id}` - Get a specific scene
- `PUT /scenes/{id}` - Update a scene

## Data Model

Scenes are stored in the database with the following structure:

```typescript
{
  id: number
  name: string
  configurationJson: string  // Serialized SceneConfig
  createdAt: Date
  updatedAt: Date
}
```

The `configurationJson` contains:

```typescript
{
  lights: Array<{
    id: string
    type: 'ambient' | 'directional' | 'point' | 'spot'
    color: string
    intensity: number
    position?: [number, number, number]
    angle?: number        // Spot light only
    penumbra?: number     // Spot light only
    distance?: number     // Point/Spot lights
    decay?: number        // Point/Spot lights
  }>
}
```

## Technical Details

### Frontend Stack
- React 19
- Three.js / React Three Fiber
- PrimeReact (UI components)
- TypeScript

### Backend Stack
- .NET 9.0
- Clean Architecture
- Entity Framework Core
- PostgreSQL

### Architecture
- **Domain Layer**: Scene entity with validation
- **Application Layer**: CQRS with commands and queries
- **Infrastructure Layer**: Repository implementation
- **WebApi Layer**: REST endpoints

## Development

### Database Migration
After pulling these changes, run a database migration to create the `Scenes` table:

```bash
cd src/Infrastructure
dotnet ef migrations add AddSceneTable
dotnet ef database update
```

### Running Locally
1. Start the backend: `cd src/WebApi && dotnet run`
2. Start the frontend: `cd src/frontend && npm run dev`
3. Open http://localhost:3000

## Future Enhancements

Potential improvements for future phases:
- Additional component types (cameras, meshes, materials)
- Scene hierarchy/grouping
- Transform gizmos for visual manipulation
- Animation timeline
- Export to various formats (GLB, FBX)
- Collaborative editing
- Asset library integration
