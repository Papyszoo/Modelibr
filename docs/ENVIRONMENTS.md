# Environments Feature

## Overview

The Environments feature allows users to create and manage custom 3D scene configurations for model preview. Each environment can define lighting, camera positioning, environment maps, and shadow settings that will be applied when viewing 3D models.

## Features

- **Multiple Environments**: Create and manage multiple environment presets
- **Default Environment**: Designate one environment as the default for all new model views
- **Customizable Settings**:
  - Light intensity
  - Environment preset (HDR map selection)
  - Shadow configuration (type, opacity, blur)
  - Camera settings (auto-adjust, distance, angle)
  - Optional background models for complex scenes

## Default Environment

The system comes with a pre-configured "Stage" environment that mirrors the previous hard-coded scene settings:
- **Name**: Stage
- **Light Intensity**: 0.5
- **Environment Preset**: city
- **Shadows**: Contact shadows with 0.4 opacity and 2.0 blur
- **Default**: Yes

This environment is automatically created during database initialization if no environments exist.

## Backend Architecture

### Domain Model

**Location**: `src/Domain/Models/Environment.cs`

The Environment entity includes:
- Basic properties (Id, Name, Description, IsDefault)
- Lighting settings (LightIntensity, EnvironmentPreset)
- Shadow settings (ShowShadows, ShadowType, ShadowOpacity, ShadowBlur)
- Camera settings (AutoAdjustCamera, CameraDistance, CameraAngle)
- Optional BackgroundModelId for complex environments
- Audit fields (CreatedAt, UpdatedAt)

Factory methods:
- `Create()`: Creates a new environment with validation
- `CreateDefaultStage()`: Creates the default "Stage" environment

Business rules:
- Name is required (max 100 characters)
- Light intensity must be between 0 and 10
- Environment preset must be a valid Three.js preset
- Shadow opacity must be between 0 and 1
- Shadow blur must be between 0 and 10

### Application Layer

**Location**: `src/Application/Environments/`

CQRS Commands:
- `CreateEnvironmentCommand`: Create a new environment
- `UpdateEnvironmentCommand`: Update an existing environment
- `DeleteEnvironmentCommand`: Delete an environment (cannot delete default)
- `SetDefaultEnvironmentCommand`: Set an environment as default (unsets previous default)

CQRS Queries:
- `GetAllEnvironmentsQuery`: Retrieve all environments (ordered by default status, then name)
- `GetEnvironmentByIdQuery`: Retrieve a specific environment by ID

### Infrastructure Layer

**Repository**: `src/Infrastructure/Repositories/EnvironmentRepository.cs`

Implements `IEnvironmentRepository` with methods for:
- Adding environments
- Retrieving all, by ID, by name, or default environment
- Updating and deleting environments

**Database Migration**: `20251010144614_AddEnvironments.cs`

Creates the Environments table with:
- Unique constraint on Name
- Index on IsDefault for efficient default lookups
- All required fields with appropriate types and constraints

**Seeding**: `src/Infrastructure/Extensions/DatabaseExtensions.cs`

Automatically seeds the default "Stage" environment on first startup if no environments exist.

### API Endpoints

**Location**: `src/WebApi/Endpoints/EnvironmentsEndpoints.cs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/environments` | Get all environments |
| GET | `/environments/{id}` | Get environment by ID |
| POST | `/environments` | Create new environment |
| PUT | `/environments/{id}` | Update environment |
| POST | `/environments/{id}/set-default` | Set environment as default |
| DELETE | `/environments/{id}` | Delete environment |

All endpoints return appropriate status codes and error messages.

## Frontend Implementation

### API Client

**Location**: `src/frontend/src/services/ApiClient.ts`

Added methods:
- `getEnvironments()`: Fetch all environments
- `getEnvironmentById(id)`: Fetch specific environment
- `createEnvironment(data)`: Create new environment
- `updateEnvironment(id, data)`: Update environment
- `setDefaultEnvironment(id)`: Set as default
- `deleteEnvironment(id)`: Delete environment

Added `EnvironmentDto` interface to match backend data structure.

### Model Viewer Integration

**Location**: `src/frontend/src/features/model-viewer/components/ModelPreviewScene.tsx`

The Scene component now:
1. Loads the selected environment (or default if none selected)
2. Applies environment settings to the Three.js Stage component:
   - Light intensity
   - Environment preset (HDR map)
   - Shadow configuration
   - Camera auto-adjust settings

The environment is loaded based on the `environmentId` in viewer settings, falling back to the default environment if not specified.

### Viewer Settings

**Location**: `src/frontend/src/features/model-viewer/components/ViewerSettings.tsx`

Added:
- `environmentId` to `ViewerSettingsType` interface
- Environment selector dropdown in the UI
- Loads available environments on mount
- Displays default environment with "(Default)" suffix

### Environments Manager Component

**Location**: `src/frontend/src/components/EnvironmentsManager.tsx`

A complete management UI featuring:
- **DataTable** displaying all environments with:
  - Name, Description, Preset, Default status
  - Action buttons (Edit, Set Default, Delete)
- **Create/Edit Dialog** with form fields:
  - Name (text)
  - Description (textarea)
  - Environment Preset (dropdown with all valid presets)
  - Light Intensity (numeric slider 0-10)
  - Show Shadows (checkbox)
  - Set as Default (checkbox, only for creation)
- **Validation**: Prevents deletion of default environment
- **Error Handling**: Console logging for API errors

## Environment Presets

The following Three.js environment presets are supported:
- **city**: Urban environment with buildings
- **dawn**: Early morning lighting
- **forest**: Natural forest setting
- **lobby**: Indoor lobby environment
- **night**: Night scene
- **park**: Outdoor park setting
- **studio**: Studio lighting setup
- **sunset**: Sunset lighting
- **warehouse**: Industrial warehouse

These presets are HDR environment maps that affect reflections and ambient lighting.

## Usage Examples

### Backend - Create Environment

```csharp
var command = new CreateEnvironmentCommand(
    Name: "Studio Setup",
    LightIntensity: 0.8,
    EnvironmentPreset: "studio",
    ShowShadows: true,
    IsDefault: false,
    Description: "Professional studio lighting for product photography"
);

var result = await commandHandler.Handle(command, cancellationToken);
```

### Frontend - Use Environment

```typescript
// In viewer settings
const settings: ViewerSettingsType = {
  orbitSpeed: 1,
  zoomSpeed: 1,
  panSpeed: 1,
  modelRotationSpeed: 0.002,
  showShadows: true,
  environmentId: 5  // Select specific environment
}

// Pass to Scene component
<Scene model={model} settings={settings} />
```

### Frontend - Manage Environments

```typescript
import EnvironmentsManager from './components/EnvironmentsManager'

// In your settings or admin panel
<EnvironmentsManager />
```

## Database Schema

```sql
CREATE TABLE "Environments" (
    "Id" serial PRIMARY KEY,
    "Name" varchar(100) NOT NULL UNIQUE,
    "Description" varchar(500),
    "IsDefault" boolean NOT NULL,
    "LightIntensity" double precision NOT NULL,
    "EnvironmentPreset" varchar(50) NOT NULL,
    "ShowShadows" boolean NOT NULL,
    "ShadowType" varchar(50),
    "ShadowOpacity" double precision NOT NULL,
    "ShadowBlur" double precision NOT NULL,
    "AutoAdjustCamera" boolean NOT NULL,
    "CameraDistance" double precision,
    "CameraAngle" double precision,
    "BackgroundModelId" integer,
    "CreatedAt" timestamp NOT NULL,
    "UpdatedAt" timestamp NOT NULL
);

CREATE UNIQUE INDEX "IX_Environments_Name" ON "Environments" ("Name");
CREATE INDEX "IX_Environments_IsDefault" ON "Environments" ("IsDefault");
```

## Testing

### Manual Testing Steps

1. **Start the application** with database connection
2. **Verify default environment** was created:
   ```bash
   curl http://localhost:8080/environments
   ```
3. **Create a new environment**:
   ```bash
   curl -X POST http://localhost:8080/environments \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Night Scene",
       "lightIntensity": 0.3,
       "environmentPreset": "night",
       "showShadows": true,
       "description": "Dark night environment"
     }'
   ```
4. **View a model** and select different environments from viewer settings
5. **Observe changes** in lighting, shadows, and environment reflections

### Expected Behavior

- Default "Stage" environment is created on first run
- Only one environment can be default at a time
- Cannot delete the default environment
- Environment changes are immediately reflected in 3D viewer
- Environment selector shows "(Default)" next to default environment

## Future Enhancements

Potential improvements for the environments feature:

1. **Background Models**: Implement the BackgroundModelId feature to allow complex scene setups
2. **Camera Presets**: Full camera position/rotation presets per environment
3. **Environment Previews**: Thumbnail images for each environment
4. **Import/Export**: Allow sharing environments between instances
5. **Per-Model Environments**: Associate specific environments with specific models
6. **Custom HDR Maps**: Upload custom environment maps
7. **Animation**: Animate between environment transitions
8. **Lighting Rig**: Support for multiple light sources with positions

## Migration Guide

### From Previous Implementation

The previous implementation had hard-coded values in `ModelPreviewScene.tsx`:
```tsx
<Stage
  intensity={0.5}
  environment="city"
  shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
  adjustCamera={false}
>
```

These exact settings have been preserved in the default "Stage" environment. Existing users will see no change in behavior unless they choose to select a different environment.

### Upgrading

1. Run database migrations: `dotnet ef database update`
2. Default environment will be created automatically
3. No frontend changes required - default behavior is preserved
4. Optionally add EnvironmentsManager component to admin/settings UI

## Related Files

### Backend
- `src/Domain/Models/Environment.cs` - Domain model
- `src/Application/Environments/*.cs` - CQRS commands and queries  
- `src/Application/Abstractions/Repositories/IEnvironmentRepository.cs` - Repository interface
- `src/Infrastructure/Repositories/EnvironmentRepository.cs` - Repository implementation
- `src/Infrastructure/Persistence/ApplicationDbContext.cs` - EF Core configuration
- `src/Infrastructure/Extensions/DatabaseExtensions.cs` - Default environment seeding
- `src/Infrastructure/Migrations/*_AddEnvironments.cs` - Database migration
- `src/WebApi/Endpoints/EnvironmentsEndpoints.cs` - API endpoints
- `src/WebApi/Program.cs` - Endpoint registration

### Frontend
- `src/frontend/src/services/ApiClient.ts` - API client methods
- `src/frontend/src/features/model-viewer/components/ModelPreviewScene.tsx` - Environment application
- `src/frontend/src/features/model-viewer/components/ViewerSettings.tsx` - Environment selection
- `src/frontend/src/components/EnvironmentsManager.tsx` - Management UI

## Troubleshooting

### Environment Not Loading
- Check browser console for API errors
- Verify environment exists in database
- Ensure default environment is set if no environmentId specified

### Default Environment Not Created
- Check database connection during startup
- Review application logs for seeding errors
- Manually create default environment via API if needed

### Cannot Delete Environment
- Ensure it's not the default environment
- Set another environment as default first
- Check for any referential constraints

## API Examples

### Get All Environments
```bash
curl http://localhost:8080/environments
```

### Create Environment
```bash
curl -X POST http://localhost:8080/environments \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Forest Scene",
    "description": "Natural forest lighting",
    "lightIntensity": 0.6,
    "environmentPreset": "forest",
    "showShadows": true,
    "isDefault": false
  }'
```

### Update Environment
```bash
curl -X PUT http://localhost:8080/environments/2 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Forest",
    "description": "Enhanced forest scene",
    "lightIntensity": 0.7,
    "environmentPreset": "forest",
    "showShadows": true,
    "shadowType": "contact",
    "shadowOpacity": 0.5,
    "shadowBlur": 3
  }'
```

### Set Default
```bash
curl -X POST http://localhost:8080/environments/2/set-default
```

### Delete Environment
```bash
curl -X DELETE http://localhost:8080/environments/3
```
