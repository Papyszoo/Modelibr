# Modelibr — AI Agent Instructions

> **This is the single source of truth for all AI agents.** Both GitHub Copilot and Gemini/Antigravity must follow these rules.
> For specialized workflows, see `.github/agents/` (e2e testing, feature implementation).

## Identity

Modelibr is a .NET 9.0 C# Web API with a React/TypeScript frontend, Node.js worker service, and Python Blender addon. Clean Architecture with DDD. PostgreSQL database. Docker Compose for orchestration. Hash-based file storage with deduplication.

---

## Hard Rules

These rules are non-negotiable. Violating any of them is a blocking error.

### OFFLINE-FIRST

The application MUST work completely offline. Never suggest or implement solutions requiring external API calls (cloud AI, CDNs, external APIs, `googleapis.com`, `openai`, `anthropic`, `azure.cognitive`).

### CLEAN ARCHITECTURE — Dependency Flow

```
WebApi → Application → Domain ← Infrastructure
                ↓              ↑
           SharedKernel ← ← ← ←
```

- **Domain + SharedKernel**: Zero dependencies on other layers. No EF Core, no HTTP, no framework code.
- **Application**: Only depends on Domain and SharedKernel. Defines interfaces — never implements infrastructure.
- **Infrastructure**: Implements Application interfaces. Contains EF Core, file I/O, external integrations.
- **WebApi**: HTTP concerns only. Maps requests to Application commands/queries.

### ENVIRONMENT VARIABLES

- All config lives in the root `.env` file. Never create `.env` files in subdirectories.
- Always update `.env.example` when adding or modifying variables.
- Never hardcode URLs or override `.env` values in `docker-compose.yml`. Use `${VARIABLE_NAME}` syntax.

### DATABASE

- Never use in-memory database. Always PostgreSQL via Docker Compose.
- Never remove connection strings from `appsettings.Development.json`.

### NO FILE CREATION WITHOUT PURPOSE

- Never create standalone documentation files (`.md`, `.txt`, `.doc`) unless explicitly requested.
- Never create files in the repository root (only `README.md` lives there).
- Exception: `docs/RESEARCH/` is allowed for audit/analysis artifacts.

---

## Code Style

### Style Anchors — Follow These Patterns

When writing new code, match the structure and style of these reference files:

- **Command handler**: `src/Application/Models/AddModelCommandHandler.cs`
- **Domain entity**: `src/Domain/Models/Model.cs`
- **Endpoint**: `src/WebApi/Endpoints/ModelEndpoints.cs`
- **Repository**: `src/Infrastructure/Repositories/ModelRepository.cs`
- **React component**: Keep simple, single-responsibility, minimal props. Use `useState` by default. Use `ApiClient` for all HTTP calls.

### Naming Conventions

- Commands: `{Verb}{Noun}Command` (e.g., `AddModelCommand`)
- Queries: `{Get}{Noun}Query` (e.g., `GetAllModelsQuery`)
- Handlers: `{CommandName}Handler` (e.g., `AddModelCommandHandler`)
- Interfaces: `I{Name}` (e.g., `IModelRepository`)
- Value Objects: Descriptive noun (e.g., `FileType`, not `FileTypeVO`)

### Keep It Simple

- Implement only what is specifically requested. Suggest improvements as comments to the user — never auto-apply unrequested changes.
- Add comments only for non-obvious business logic. No JSDoc on self-explanatory methods.
- Frontend: Don't create custom hooks unless logic is reused in 3+ places. Use `ApiClient` from `src/frontend/src/services/ApiClient.ts` — never raw `fetch()` or hardcoded URLs.
- Frontend: Use `nuqs` (`useQueryState`) for tab/URL state persistence. Follow `SplitterLayout.tsx` pattern.

---

## Guardrails & Stop Conditions

### Scope Creep

If the task requires modifying more than 3 files not mentioned in the original request, **PAUSE**. Present a scope expansion proposal to the user before proceeding.

### Build Verification

After every backend edit: `dotnet build Modelibr.sln`. After every frontend edit: check for lint/type errors. If the build fails, **revert the last edit** and ask the user for guidance — do not attempt speculative fixes.

### Confidence Signaling

Prefix implementation proposals with a confidence level:

- **[CERTAIN]** — I've read the exact code and know the pattern.
- **[EXPLORING]** — I'm inferring from naming conventions or partial context.
- **[GUESSING]** — I haven't found relevant code; this is best-effort. **PAUSE and ask the user.**

### Large File Reads

If a file exceeds 200 lines, read method signatures first (use symbol overview tools if available). Read full method bodies only for the specific method you need to edit.

### Rabbit Hole Prevention

If you perform more than 5 sequential searches without producing an edit, **PAUSE**. Summarize what you found and ask the user if the direction is correct.

---

## Documentation Maintenance

### CRITICAL: Update Docs After Every Task

This is a mandatory completion step. Before marking any task complete, check:

1. **Did the task change any API endpoint?** → Update `docs/docs/ai-documentation/BACKEND_API.md`
2. **Did the task change frontend behavior or components?** → Update `docs/docs/ai-documentation/FRONTEND.md`
3. **Did the task change worker service behavior?** → Update `docs/docs/ai-documentation/WORKER.md`
4. **Did the task change Blender addon behavior?** → Update `docs/docs/ai-documentation/BLENDER_ADDON.md`
5. **Did the task change test infrastructure or patterns?** → Update `docs/docs/ai-documentation/TESTING.md`
6. **Did the task change environment variables or Docker config?** → Update `.env.example` and relevant doc
7. **Did the task change API contracts between services?** → Update `docs/docs/ai-documentation/API_CONTRACTS.md`

If none of the above apply, no doc update is needed. But you MUST explicitly check.

### Documentation Locations (Canonical)

| What                       | Where                                                   |
| -------------------------- | ------------------------------------------------------- |
| User-facing README         | `README.md`                                             |
| AI agent instructions      | `.github/copilot-instructions.md` (this file)           |
| Backend API reference      | `docs/docs/ai-documentation/BACKEND_API.md`             |
| Frontend development guide | `docs/docs/ai-documentation/FRONTEND.md`                |
| Worker service guide       | `docs/docs/ai-documentation/WORKER.md`                  |
| Blender addon guide        | `docs/docs/ai-documentation/BLENDER_ADDON.md`           |
| Testing guide              | `docs/docs/ai-documentation/TESTING.md`                 |
| API contracts              | `docs/docs/ai-documentation/API_CONTRACTS.md`           |
| Texture channel mapping    | `docs/docs/ai-documentation/TEXTURE_CHANNEL_MAPPING.md` |
| E2E tests                  | `tests/e2e/` (see `tests/e2e/README.md`)                |
| Audit/research artifacts   | `docs/RESEARCH/`                                        |
| User documentation site    | `docs/` (Docusaurus)                                    |

---

## Build & Test Commands

### Backend (.NET)

```bash
dotnet restore Modelibr.sln          # ~10 seconds. Never cancel.
dotnet build Modelibr.sln            # ~10 seconds. Never cancel.
dotnet test Modelibr.sln --no-build  # ~2 seconds. Always use --no-build.
```

### Frontend (React)

```bash
cd src/frontend
npm install
npm test                             # Jest unit tests
npm run lint                         # ESLint
```

### E2E Tests

```bash
cd tests/e2e
npm run test:setup                   # Start Docker containers + wait for health
npm run test:quick                   # Run ALL tests (existing containers)
npm run test:quick -- --grep "Pack"  # Run only matching tests
npm run test:teardown                # Stop containers + clean volumes
npm run test:e2e                     # Full run (setup → all tests → teardown)
```

When fixing tests, run only the affected files — not the full suite.

### Run Locally

```bash
# Backend
export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"
cd src/WebApi && dotnet run          # http://localhost:5009

# Or full stack via Docker Compose
cp .env.example .env                 # First time only
docker compose up -d --build
```

### Service Ports

| Service        | Dev Port | Docker Port |
| -------------- | -------- | ----------- |
| WebApi         | 5009     | 8080        |
| Frontend       | 3000     | 3000        |
| Worker         | 3001     | 3001        |
| PostgreSQL     | 5432     | 5432        |
| E2E WebApi     | —        | 8090        |
| E2E Frontend   | —        | 3002        |
| E2E PostgreSQL | —        | 5433        |

### Build Timing — Never Cancel

- Package restore: ~10s
- Build: ~10s
- Tests (--no-build): ~2s
- App startup: ~4s

---

## Architecture Quick Reference

### Design Patterns

- **CQRS**: Commands (write, return `Result<T>`), Queries (read, return DTOs), one Handler per operation.
- **Result Pattern**: All fallible operations return `Result<T>` from SharedKernel. No exceptions for flow control.
- **Value Objects**: Immutable, self-validating, equality by value (e.g., `FileType`).
- **Entity Factory Methods**: `Entity.Create(...)` — controlled construction with validation.
- **Repository Pattern**: Interface in Application, implementation in Infrastructure.

### Key Code Locations

| What                  | Where                                                     |
| --------------------- | --------------------------------------------------------- |
| Entry point           | `src/WebApi/Program.cs`                                   |
| DI registration       | `src/*/DependencyInjection.cs`                            |
| API client (frontend) | `src/frontend/src/services/ApiClient.ts`                  |
| File storage          | `src/Infrastructure/Storage/HashBasedFileStorage.cs`      |
| Upload init           | `src/WebApi/Infrastructure/UploadDirectoryInitializer.cs` |
| Docker config         | `docker-compose.yml`, `src/WebApi/Dockerfile`             |

### Asset Type Pattern

All asset types (Models, Sprites, Sounds, TextureSets) follow the same structure:

- Domain entity with factory method, soft delete, Pack/Project navigation properties
- Optional category entity for user organization
- Application CQRS handlers for CRUD + associations
- Infrastructure repository + EF Core config
- WebApi RESTful endpoints
- Frontend list page with category tabs, card grid, drag-drop upload

For the full step-by-step template, use the `@feature` agent: `.github/agents/feature.agent.md`

---

## Agent Workflows

Use specialized agents for specific task types:

| Task Type                     | Agent                                          | When to Use                                                      |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| E2E testing                   | `@e2e` (`.github/agents/e2e.agent.md`)         | Writing, fixing, or running Playwright-BDD E2E tests             |
| New feature/entity/asset type | `@feature` (`.github/agents/feature.agent.md`) | Implementing new entities, asset types, CQRS handlers, endpoints |
| General coding                | Default (this file)                            | Bug fixes, refactoring, configuration changes, investigations    |

### Workflow: Planning

1. Read this file and relevant `docs/docs/ai-documentation/` files for context.
2. Search existing code for similar patterns before creating anything new.
3. Present a plan with files to create/modify. Get user approval if >3 files.

### Workflow: Implementation

1. Follow the style anchors above. Match existing patterns exactly.
2. Build after every backend change. Lint after every frontend change.
3. If build fails, revert and ask — don't speculate.
4. Signal confidence level on every proposal.

### Workflow: Testing

1. Write unit tests for domain/application logic.
2. For E2E tests, use the `@e2e` agent and follow `tests/e2e/README.md`.
3. Run `dotnet test Modelibr.sln --no-build` before considering backend work complete.
4. Run `npm test` in `src/frontend` before considering frontend work complete.

### Workflow: Completion

1. Verify build passes across all affected layers.
2. **Check the documentation update checklist** (§Documentation Maintenance above).
3. Summarize what was done, what was changed, and any trade-offs.

---

## Common Pitfalls

- Azure.Core dependency error in tests → use `--no-build` flag
- Permission denied on upload dir → set `UPLOAD_STORAGE_PATH=/tmp/modelibr/uploads`
- .NET version errors → ensure .NET 9.0 SDK is installed
- Frontend API calls → always use `ApiClient`, never `fetch()` or hardcoded URLs
- EF Core in Domain layer → never. Configure entities in `ApplicationDbContext.OnModelCreating`
- Business logic in repositories → never. Keep repositories as thin data access wrappers
