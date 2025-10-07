# Application Settings Feature

## Overview
This feature adds a comprehensive application settings system that allows runtime configuration of key parameters through a web UI.

## What Was Implemented

### Backend (C# / .NET 9.0)

#### Domain Layer (`src/Domain/`)
- **ApplicationSettings Entity** (`Models/ApplicationSettings.cs`)
  - Stores configurable settings in database
  - File size limits (max file size, max thumbnail size)
  - Thumbnail generation parameters (frame count, camera angle, dimensions)
  - Built-in validation for all settings

#### Application Layer (`src/Application/`)
- **Settings Service** (`Settings/ISettingsService.cs`)
  - Provides centralized access to settings
  - Auto-creates default settings if none exist
  
- **Commands & Queries**
  - `GetSettingsQuery` - Retrieve current settings
  - `UpdateSettingsCommand` - Update all settings atomically
  - Handlers for both operations with validation

- **Repository Interface** (`Abstractions/Repositories/IApplicationSettingsRepository.cs`)
  - Clean architecture abstraction for data access

#### Infrastructure Layer (`src/Infrastructure/`)
- **Repository Implementation** (`Repositories/ApplicationSettingsRepository.cs`)
  - EF Core-based persistence
  - Ensures only one settings record exists
  
- **Database Configuration** (`Persistence/ApplicationDbContext.cs`)
  - DbSet for ApplicationSettings
  - Entity configuration with proper constraints
  
- **Migration** (`Migrations/20251007000000_AddApplicationSettings.cs`)
  - Creates ApplicationSettings table with all columns

#### WebApi Layer (`src/WebApi/`)
- **Settings Endpoints** (`Endpoints/SettingsEndpoints.cs`)
  - `GET /settings` - Retrieve settings
  - `PUT /settings` - Update settings
  
- **Updated File Validation**
  - `FilesEndpoints.cs` - Uses settings for max file size
  - `ModelEndpoints.cs` - Uses settings for model file size
  - `ThumbnailEndpoints.cs` - Uses settings for thumbnail size
  - All endpoints now respect configurable limits

### Frontend (React / TypeScript)

#### Settings Component (`src/frontend/src/components/tabs/Settings.tsx`)
- Full-featured settings form with:
  - File upload settings (max file size, max thumbnail size)
  - Thumbnail generation settings (frame count, camera angle, dimensions)
  - Real-time validation
  - Success/error feedback
  - Reset functionality

#### UI Integration
- Added 'settings' tab type to tab system
- Settings menu item in dock panel (accessible via + button)
- Professional dark theme styling matching app design
- Responsive form layout with helpful descriptions

## Configuration Options

### File Upload Settings
- **Maximum File Size**: 1 MB - 10 GB (default: 1 GB)
- **Maximum Thumbnail Size**: 1 MB - 100 MB (default: 10 MB)

### Thumbnail Generation Settings
- **Frame Count**: 1-360 frames (default: 30)
  - Controls number of frames in thumbnail animation
  - Lower = faster generation, higher = smoother animation
  
- **Camera Vertical Angle**: 0-2 (default: 0.75)
  - Camera height multiplier for thumbnail rendering
  
- **Thumbnail Width**: 64-2048 pixels (default: 256)
- **Thumbnail Height**: 64-2048 pixels (default: 256)

## How to Use

### Opening Settings
1. Click the "+" button in the dock panel (left or right side)
2. Select "Settings" from the menu
3. Settings tab will open showing current configuration

### Updating Settings
1. Modify any setting using the form inputs
2. Click "Save Settings" button
3. Success message will appear confirming changes
4. New limits will be immediately applied to file uploads

### Resetting Settings
- Click "Reset" button to reload current saved values
- Or refresh the settings tab

## Default Values
When no settings exist in database, defaults are automatically created:
- Max File Size: 1 GB (1,073,741,824 bytes)
- Max Thumbnail Size: 10 MB (10,485,760 bytes)
- Thumbnail Frame Count: 30
- Camera Vertical Angle: 0.75
- Thumbnail Dimensions: 256x256 pixels

## Database Requirements
- PostgreSQL database must be running and accessible
- Connection string configured in `appsettings.Development.json`
- Migration `20251007000000_AddApplicationSettings` must be applied
- Settings are stored in `ApplicationSettings` table (single row)

## Testing Locally

### Prerequisites
1. .NET 9.0 SDK installed
2. PostgreSQL running on localhost:5432
3. Environment variables set:
   ```bash
   export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
   export POSTGRES_PORT=5432
   export POSTGRES_USER=postgres
   export POSTGRES_PASSWORD=postgres
   ```

### Run Backend
```bash
cd src/WebApi
dotnet run
```
API will be available at http://localhost:8080

### Run Frontend
```bash
cd src/frontend
npm install
npm run dev
```
UI will be available at http://localhost:3000

### Test Settings API
```bash
# Get current settings
curl http://localhost:8080/settings

# Update settings
curl -X PUT http://localhost:8080/settings \
  -H "Content-Type: application/json" \
  -d '{
    "maxFileSizeBytes": 2147483648,
    "maxThumbnailSizeBytes": 20971520,
    "thumbnailFrameCount": 60,
    "thumbnailCameraVerticalAngle": 1.0,
    "thumbnailWidth": 512,
    "thumbnailHeight": 512
  }'
```

## Architecture Notes

### Clean Architecture Compliance
- **Domain Layer**: Pure business logic, no dependencies
- **Application Layer**: Use cases, depends only on Domain
- **Infrastructure Layer**: Implementation details, depends on Application
- **WebApi Layer**: HTTP concerns, depends on Application

### Design Patterns Used
- **Repository Pattern**: Abstract data access
- **CQRS**: Separate read/write operations
- **Value Objects**: Type-safe domain primitives
- **Dependency Injection**: Loose coupling via interfaces
- **Result Pattern**: Explicit error handling

## Future Enhancements
- Settings history/audit log
- Settings import/export
- Per-user settings override
- Settings validation rules engine
- Real-time settings sync across instances
