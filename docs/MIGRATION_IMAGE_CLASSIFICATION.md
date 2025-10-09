# Database Migration Guide: Image Classification

This guide explains how to apply the database migration for the image classification feature.

## Overview

The migration adds two new columns to the `Models` table:
- `Tags` (text, nullable): Comma-separated list of AI-generated tags with confidence scores
- `Description` (text, nullable): AI-generated description of the model

## Migration Details

**Migration Name**: `20251009150951_AddModelTagsAndDescription`

**Location**: `src/Infrastructure/Migrations/20251009150951_AddModelTagsAndDescription.cs`

## Applying the Migration

### Development Environment

1. **Using Entity Framework CLI**:
   ```bash
   cd src/Infrastructure
   dotnet ef database update --startup-project ../WebApi/WebApi.csproj
   ```

2. **Using the application**:
   The migration will be applied automatically when the application starts if you have auto-migration enabled.

### Production Environment

1. **Generate SQL Script** (recommended for production):
   ```bash
   cd src/Infrastructure
   dotnet ef migrations script --startup-project ../WebApi/WebApi.csproj --output migration.sql
   ```

2. **Review the SQL**:
   ```sql
   ALTER TABLE "Models" ADD "Description" text NULL;
   ALTER TABLE "Models" ADD "Tags" text NULL;
   ```

3. **Apply manually** using your preferred database tool:
   ```bash
   psql -U postgres -d modelibr -f migration.sql
   ```

### Docker Environment

The migration will be applied automatically when the container starts, as the application applies pending migrations at startup.

To verify:
```bash
docker compose logs webapi | grep Migration
```

## Verification

Check that the columns were added:

```sql
\d "Models"
```

You should see:
```
Column      | Type    | Nullable
------------|---------|----------
...
Tags        | text    | YES
Description | text    | YES
```

## Rollback

To rollback this migration:

```bash
cd src/Infrastructure
dotnet ef database update 20251009100426_RenameTexturePackToTextureSet --startup-project ../WebApi/WebApi.csproj
```

Or manually:
```sql
ALTER TABLE "Models" DROP COLUMN "Description";
ALTER TABLE "Models" DROP COLUMN "Tags";
```

## Data Population

After migration:
1. Existing models will have NULL values for Tags and Description
2. New uploads will have NULL values initially
3. Tags/Description are populated by the worker after thumbnail generation
4. Re-running thumbnail generation on existing models will populate their tags

To trigger classification for existing models:
```bash
# Use the regenerate thumbnail endpoint
POST /models/{id}/thumbnail/regenerate
```

## Schema Changes

### Before
```sql
CREATE TABLE "Models" (
  "Id" SERIAL PRIMARY KEY,
  "Name" VARCHAR(200) NOT NULL,
  "CreatedAt" TIMESTAMP NOT NULL,
  "UpdatedAt" TIMESTAMP NOT NULL
);
```

### After
```sql
CREATE TABLE "Models" (
  "Id" SERIAL PRIMARY KEY,
  "Name" VARCHAR(200) NOT NULL,
  "CreatedAt" TIMESTAMP NOT NULL,
  "UpdatedAt" TIMESTAMP NOT NULL,
  "Tags" TEXT NULL,
  "Description" TEXT NULL
);
```

## Performance Impact

- **Storage**: TEXT columns store variable-length strings
  - Tags: ~100-500 bytes per model
  - Description: ~50-200 bytes per model
  - Total: ~150-700 bytes per model

- **Indexing**: Not indexed (not frequently queried)
  - Future: Add GIN index for full-text search if needed

- **Queries**: No impact on existing queries (new columns are nullable and not in WHERE clauses)

## Testing

Verify the migration with a test model:

1. Upload a model
2. Wait for thumbnail generation
3. Check the model record:
   ```sql
   SELECT "Id", "Name", "Tags", "Description" FROM "Models" WHERE "Id" = {model_id};
   ```

Expected result:
```
Id | Name      | Tags                                  | Description
---|-----------|---------------------------------------|-------------------------
1  | test.obj  | table (75.0%, 3x), chair (60.0%, 1x) | Contains table and chair
```

## Troubleshooting

### Migration Fails

**Error**: "Column already exists"
- **Cause**: Migration was partially applied
- **Fix**: Drop the columns manually and rerun migration

**Error**: "Permission denied"
- **Cause**: Database user lacks ALTER TABLE permission
- **Fix**: Grant appropriate permissions or use admin user

### Tags Not Populating

1. Check worker is running and IMAGE_CLASSIFICATION_ENABLED=true
2. Check worker logs for classification errors
3. Verify worker can reach backend API
4. Manually trigger classification: POST /models/{id}/thumbnail/regenerate

## Related Files

- Migration: `src/Infrastructure/Migrations/20251009150951_AddModelTagsAndDescription.cs`
- Model Entity: `src/Domain/Models/Model.cs`
- Update Command: `src/Application/Models/UpdateModelTagsCommand.cs`
- API Endpoint: `src/WebApi/Endpoints/ModelEndpoints.cs`
- Worker Integration: `src/worker-service/jobProcessor.js`
