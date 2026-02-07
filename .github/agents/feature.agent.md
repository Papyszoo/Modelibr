---
description: "Expert in implementing new features, entities, asset types, and CQRS handlers for Modelibr Clean Architecture."
tools:
    [
        "vscode",
        "execute",
        "read",
        "edit",
        "search",
        "agent",
        "github/*",
        "todo",
    ]
---

# Modelibr Feature Implementation Agent

> **Prerequisites**: Read `.github/copilot-instructions.md` for core rules, style anchors, and guardrails.

Specializes in implementing new features across all layers of the Clean Architecture stack.

## When to Use This Agent

Use `@feature` when:
- Adding a new entity or asset type (Models, Sprites, Sounds, TextureSets, etc.)
- Creating new CQRS commands/queries/handlers
- Adding new API endpoints
- Implementing new frontend pages/components for a feature
- Adding new value objects

Do NOT use for bug fixes, config changes, E2E tests, or code review.

---

## Workflow: Adding a New Asset Type

All asset types follow the same pattern. Copy from the closest existing example.

### Step 1 — Domain Layer (`src/Domain/`)

Create entity with:
- Factory method: `Asset.Create(...)`
- Update methods: `UpdateName()`, `UpdateCategory()`
- Soft delete: `SoftDelete()`, `Restore()` with `IsDeleted`/`DeletedAt` fields
- Navigation properties: `ICollection<Pack>`, `ICollection<Project>` (many-to-many)
- Optional category FK: `AssetCategoryId`

Create optional category entity:
- `AssetCategory.Create(name, description)`
- `AssetCategory.Update(name, description)`

**Reference**: `src/Domain/Models/Model.cs`

### Step 2 — Application Layer (`src/Application/`)

Repository interfaces in `Abstractions/Repositories/`:
- `IAssetRepository` — GetAll, GetById, Add, Update, Delete
- `IAssetCategoryRepository` — same CRUD pattern
- GetAll should support filtering by Pack/Project

CQRS handlers — one file per operation:
- `CreateAssetCommand` + `CreateAssetWithFileCommand`
- `UpdateAssetCommand`, `DeleteAssetCommand`, `SoftDeleteAssetCommand`
- `GetAllAssetsQuery`, `GetAssetByIdQuery`
- Category CRUD commands/queries
- Pack/Project association: `AddAssetToPackCommand`, `RemoveAssetFromPackCommand`

**Reference**: `src/Application/Models/AddModelCommandHandler.cs`

### Step 3 — Infrastructure Layer (`src/Infrastructure/`)

- Repository implementations in `Repositories/`
- Add `DbSet<Asset>` to `ApplicationDbContext`
- Entity configuration in `OnModelCreating` (relationships, indexes, soft-delete filter)
- Migration: `dotnet ef migrations add AddAsset -p src/Infrastructure -s src/WebApi`

**Reference**: `src/Infrastructure/Repositories/ModelRepository.cs`

### Step 4 — WebApi Layer (`src/WebApi/`)

- RESTful endpoints: `/assets`, `/asset-categories`
- File upload: `POST /assets/with-file` (multipart form data)
- Pack/Project integration: `/packs/{id}/assets/{assetId}`
- Register endpoints in `Program.cs`

**Reference**: `src/WebApi/Endpoints/ModelEndpoints.cs`

### Step 5 — Frontend (`src/frontend/`)

- `AssetList.tsx` — Main page with category tabs, grid, drag-drop upload
- `AssetCard.tsx` — Card with thumbnail, metadata, selection
- Add tab type to `Tab['type']` union in `src/types/index.ts`
- Add icon in `DraggableTab.tsx` → `getTabIcon()`
- Add tooltip in `DraggableTab.tsx` → `getTabTooltip()`
- Add menu item in `useTabMenuItems.tsx`
- Add route in `TabContent.tsx`
- Use `ApiClient` for all HTTP calls
- Use `nuqs` for URL state persistence

### Step 6 — Register Dependencies

- Add to `src/Application/DependencyInjection.cs`
- Add to `src/Infrastructure/DependencyInjection.cs`

### Step 7 — Verify & Document

- `dotnet build Modelibr.sln`
- `dotnet test Modelibr.sln --no-build`
- `cd src/frontend && npm test`
- Update `docs/docs/ai-documentation/BACKEND_API.md` with new endpoints
- Update `docs/docs/ai-documentation/FRONTEND.md` if UI was added

---

## Workflow: Adding a New Entity (Non-Asset)

Simpler than asset types — no file storage, no categories, no Pack/Project associations.

### Step 1 — Domain
```csharp
public class NewEntity
{
    public static NewEntity Create(/* params */) { /* factory */ }
    public void Update(/* params */) { /* business logic */ }
}
```

### Step 2 — Application
```csharp
// Interface
public interface INewEntityRepository
{
    Task<NewEntity?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<NewEntity> AddAsync(NewEntity entity, CancellationToken ct = default);
}

// Command + Handler (one per operation)
public record CreateNewEntityCommand(/* params */) : ICommand<CreateNewEntityResponse>;
```

### Step 3 — Infrastructure
```csharp
// Repository
internal sealed class NewEntityRepository : INewEntityRepository { /* EF Core */ }

// DbContext
public DbSet<NewEntity> NewEntities => Set<NewEntity>();
```

### Step 4 — WebApi
```csharp
public static class NewEntityEndpoints
{
    public static void MapNewEntityEndpoints(this IEndpointRouteBuilder app) { /* routes */ }
}
```

### Step 5 — Verify & Document
Same as asset type Step 7.

---

## Workflow: Adding a New Command/Query

For adding operations to existing entities.

1. Define command/query record implementing `ICommand<TResponse>` or `IQuery<TResponse>`
2. Implement handler class implementing `ICommandHandler` or `IQueryHandler`
3. Add endpoint in the relevant `*Endpoints.cs` file
4. Build, test, document.

---

## Anti-Patterns — Hard Blocks

These will be rejected. Do not produce code that:
- Puts EF Core attributes (`[Key]`, `[Required]`) on Domain entities → configure in `OnModelCreating`
- Puts business logic in command handlers → delegate to domain entity methods
- Puts application logic in repositories → repositories are thin data access
- References Infrastructure from Domain or Application layer
- Uses `fetch()` or hardcoded URLs in frontend → use `ApiClient`

---

## Checklist Before Marking Complete

- [ ] All new code follows existing style anchors
- [ ] `dotnet build Modelibr.sln` passes
- [ ] `dotnet test Modelibr.sln --no-build` passes
- [ ] Frontend builds and tests pass (if touched)
- [ ] Dependencies registered in `DependencyInjection.cs`
- [ ] Documentation updated (see §Documentation Maintenance in copilot-instructions.md)
- [ ] No scope creep — only requested changes were made
