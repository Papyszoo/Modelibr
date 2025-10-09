# Pack Feature

Packs are organizational folders that group models and texture sets together. They provide a way to organize and categorize your 3D assets.

## Features

### Backend
- **CRUD Operations**: Create, Read, Update, Delete packs
- **Association Management**: Add/remove models and texture sets to/from packs
- **Filtering**: Filter models and texture sets by pack
- **Clean Architecture**: Domain-driven design with proper separation of concerns

### Frontend
- **Pack List**: View all packs with their content statistics
- **Pack Viewer**: See all models and texture sets in a pack
- **Pack Creation**: Create new packs with name and description
- **Content Management**: Remove models/texture sets from packs

## API Endpoints

### Pack Management
- `GET /packs` - List all packs
- `GET /packs/{id}` - Get pack details
- `POST /packs` - Create new pack
- `PUT /packs/{id}` - Update pack
- `DELETE /packs/{id}` - Delete pack

### Content Management
- `POST /packs/{packId}/models/{modelId}` - Add model to pack
- `DELETE /packs/{packId}/models/{modelId}` - Remove model from pack
- `POST /packs/{packId}/texture-sets/{textureSetId}` - Add texture set to pack
- `DELETE /packs/{packId}/texture-sets/{textureSetId}` - Remove texture set from pack

### Filtering
- `GET /models?packId={id}` - List models in a specific pack
- `GET /texture-sets?packId={id}` - List texture sets in a specific pack

## Usage

### Creating a Pack
1. Navigate to the Packs section
2. Click "Create Pack"
3. Enter pack name and optional description
4. Click "Create"

### Adding Content to Packs
Currently, content can be added to packs programmatically via the API:
```bash
# Add a model to a pack
curl -X POST http://localhost:5009/packs/1/models/5

# Add a texture set to a pack
curl -X POST http://localhost:5009/packs/1/texture-sets/3
```

### Future Enhancement: Drag and Drop
To enable drag-and-drop functionality for adding models and textures to packs:

1. **Model List Enhancement**: 
   - Add drag handle to model cards
   - Implement `draggable` attribute
   - Set drag data with model ID

2. **Pack Viewer Enhancement**:
   - Add drop zones for models and texture sets
   - Handle `onDrop` event to call appropriate API endpoint
   - Show visual feedback during drag operations

3. **Implementation Example**:
```tsx
// In ModelCard component
<div 
  draggable 
  onDragStart={(e) => {
    e.dataTransfer.setData('modelId', modelId.toString())
    e.dataTransfer.setData('type', 'model')
  }}
>
  {/* Model card content */}
</div>

// In PackViewer component
<div 
  onDrop={async (e) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('type')
    if (type === 'model') {
      const modelId = parseInt(e.dataTransfer.getData('modelId'))
      await ApiClient.addModelToPack(packId, modelId)
      loadPackContent()
    }
  }}
  onDragOver={(e) => e.preventDefault()}
>
  {/* Drop zone content */}
</div>
```

## Database Schema

### Packs Table
- `Id` (int, primary key)
- `Name` (string, required, max 200 chars)
- `Description` (string, optional, max 1000 chars)
- `CreatedAt` (datetime)
- `UpdatedAt` (datetime)

### Many-to-Many Relations
- `PackModels`: Links packs to models
- `PackTextureSets`: Links packs to texture sets

## Architecture

The Pack feature follows Clean Architecture principles:

1. **Domain Layer** (`/src/Domain/Models/Pack.cs`):
   - Domain entity with business logic
   - Validation rules
   - Domain methods

2. **Application Layer** (`/src/Application/Packs/`):
   - Commands and Queries (CQRS pattern)
   - DTOs for data transfer
   - Business workflow orchestration

3. **Infrastructure Layer** (`/src/Infrastructure/`):
   - Repository implementation
   - Database configuration
   - EF Core migrations

4. **WebApi Layer** (`/src/WebApi/Endpoints/PackEndpoints.cs`):
   - HTTP endpoint definitions
   - Request/response mapping
   - API documentation

5. **Frontend** (`/src/frontend/src/features/pack/`):
   - React components
   - API client integration
   - UI state management
