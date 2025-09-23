# Modelibr
Modelibr is a .NET 9.0 C# Web API application built using Clean Architecture principles. It provides a file upload service for 3D models with hash-based storage and deduplication. The application is containerized using Docker and includes database integration with SQL Server.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Prerequisites and Setup
- Install .NET 9.0 SDK - REQUIRED (the project targets net9.0):
  - `curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 9.0`
  - `export PATH="$HOME/.dotnet:$PATH"`
- Verify installation: `dotnet --version` (should show 9.0.x)

### Build and Test
- Bootstrap and build the repository:
  - `cd /home/runner/work/Modelibr/Modelibr`
  - `dotnet restore Modelibr.sln` -- takes 9-10 seconds. Set timeout to 15+ minutes for safety.
  - `dotnet build Modelibr.sln` -- takes 9-10 seconds. NEVER CANCEL. Set timeout to 15+ minutes.
- Run tests:
  - `dotnet test Modelibr.sln --no-build` -- takes 1-2 seconds when using --no-build flag
  - NOTE: Tests may have Azure.Core dependency issues when rebuilding. Use `--no-build` flag to avoid this.

### Run the Application
- ALWAYS set upload directory environment variable first:
  - `export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads"`
- Run the Web API:
  - `cd src/WebApi`
  - `dotnet run` -- application starts on http://localhost:5009
- Available endpoints:
  - POST `/uploadModel` - Upload 3D model files
  - The application requires SQL Server connection for full functionality

### Docker Support
- Docker Compose setup available:
  - `docker compose version` -- verify Docker Compose v2.x is available
  - Configuration in `docker-compose.yml` with SQL Server database
  - Uses ports 8080 (HTTP) and 8081 (HTTPS) in containers
  - **REQUIRED**: Create `.env` file from `.env.example` before running docker-compose
  - `cp .env.example .env` -- copy environment configuration
  - Environment variables in `.env.example` contain all required parameters

## Validation
- ALWAYS manually test the Web API after changes by running `dotnet run` and verifying it starts successfully
- Test the upload endpoint: `curl -X POST -F "file=@test.txt" http://localhost:5009/uploadModel`
- ALWAYS build with `dotnet build Modelibr.sln` before committing changes
- Use `dotnet test Modelibr.sln --no-build` to run tests without rebuild issues

## Clean Architecture and Domain-Driven Design (DDD) Guidelines

### Architecture Overview
Modelibr implements Clean Architecture with Domain-Driven Design principles, ensuring clear separation of concerns and dependency inversion:

```
┌─────────────────────────────────────────────────────────────┐
│                        WebApi Layer                         │
│            (Presentation - Controllers/Endpoints)           │
├─────────────────────────────────────────────────────────────┤
│                     Application Layer                       │
│        (Use Cases, Commands, Queries, Services)             │
├─────────────────────────────────────────────────────────────┤
│                       Domain Layer                          │
│     (Entities, Value Objects, Domain Services)              │
│                                                             │
│                    SharedKernel                             │
│              (Common Domain Primitives)                     │
├─────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                      │
│    (Data Access, External Services, Implementation)         │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities and Code Placement

#### 1. Domain Layer (`src/Domain/`)
**PURPOSE**: Contains the core business logic and domain model. This is the heart of the application.

**WHAT BELONGS HERE:**
- **Entities** (`Models/`): Core business objects with identity
  - Example: `Model.cs`, `File.cs`, `Thumbnail.cs`
  - Must contain business logic and invariants
  - Should have factory methods (e.g., `Model.Create()`)
  - Methods that enforce business rules (e.g., `AddFile()`, `UpdateName()`)
  
- **Value Objects** (`ValueObjects/`): Immutable objects that describe domain concepts
  - Example: `FileType.cs` with validation logic
  - Must be immutable and implement equality
  - Contain domain validation (e.g., `ValidateForModelUpload()`)
  
- **Domain Services** (`Services/`): Domain logic that doesn't naturally fit in entities
  - Example: `IDateTimeProvider.cs` (abstractions for testability)
  - Cross-entity operations
  - Complex business rules involving multiple entities

**WHAT DOES NOT BELONG HERE:**
- Database concerns (EF Core attributes, DbContext)
- External service dependencies
- Framework-specific code
- Infrastructure concerns (file I/O, HTTP, etc.)

**DEPENDENCIES**: Only SharedKernel. No dependencies on other layers.

#### 2. SharedKernel (`src/SharedKernel/`)
**PURPOSE**: Common building blocks shared across the domain.

**WHAT BELONGS HERE:**
- **Result Pattern** (`Result.cs`): For error handling without exceptions
- **Error Types** (`Error.cs`): Structured error representation
- **Base Classes**: Common domain primitives
- **Common Interfaces**: Shared across all layers

**DEPENDENCIES**: None (standalone).

#### 3. Application Layer (`src/Application/`)
**PURPOSE**: Orchestrates domain objects to fulfill use cases. Contains application logic but no business rules.

**WHAT BELONGS HERE:**
- **Commands/Queries** (`Models/`): CQRS pattern implementation
  - Commands: `AddModelCommand`, `AddFileToModelCommand`
  - Queries: `GetAllModelsQuery`
  - Must be simple DTOs with no logic
  
- **Command/Query Handlers** (`Models/`): Execute use cases
  - Example: `AddModelCommandHandler.cs`
  - Orchestrate domain objects
  - Handle transaction boundaries
  - Validate business rules using domain objects
  
- **Application Services** (`Services/`): Complex application logic
  - Example: `FileCreationService.cs`
  - Coordinate multiple repositories/domain services
  - Handle application-specific workflows
  
- **Abstractions** (`Abstractions/`): Interfaces for infrastructure concerns
  - **Repositories** (`Abstractions/Repositories/`): Data access contracts
  - **Services** (`Abstractions/Services/`): External service contracts
  - **Storage** (`Abstractions/Storage/`): File storage contracts
  - **Files** (`Abstractions/Files/`): File handling contracts
  - **Messaging** (`Abstractions/Messaging/`): CQRS contracts

**WHAT DOES NOT BELONG HERE:**
- Business rules (belong in Domain)
- Infrastructure implementation details
- Framework-specific code (except for DI registration)

**DEPENDENCIES**: Domain, SharedKernel only. Infrastructure injects implementations.

#### 4. Infrastructure Layer (`src/Infrastructure/`)
**PURPOSE**: Implements application abstractions and handles external concerns.

**WHAT BELONGS HERE:**
- **Repositories** (`Repositories/`): Data access implementations
  - Example: `ModelRepository.cs`, `FileRepository.cs`
  - Implement Application layer interfaces
  - Handle Entity Framework concerns
  - Mapping between domain entities and data models
  
- **Persistence** (`Persistence/`): Database configuration
  - Example: `ApplicationDbContext.cs`
  - Entity Framework configuration
  - Database migrations
  - Value object conversions
  
- **Storage** (`Storage/`): File system operations
  - Example: `HashBasedFileStorage.cs`
  - Implement storage abstractions from Application layer
  - Handle file deduplication logic
  
- **Services** (`Services/`): External service implementations
  - Example: `ThumbnailQueue.cs`
  - Implement Application layer service abstractions
  - Third-party integrations
  
- **Extensions** (`Extensions/`): Infrastructure utilities
  - Database initialization
  - Migration helpers

**WHAT DOES NOT BELONG HERE:**
- Business logic (belongs in Domain)
- Application workflow logic (belongs in Application)
- Presentation concerns (belongs in WebApi)

**DEPENDENCIES**: All layers (Domain, Application, SharedKernel, external packages).

#### 5. WebApi Layer (`src/WebApi/`)
**PURPOSE**: Handles HTTP concerns and user interface. Entry point for external requests.

**WHAT BELONGS HERE:**
- **Endpoints** (`Endpoints/`): HTTP endpoint definitions
  - Example: `ModelEndpoints.cs`, `FilesEndpoints.cs`
  - Handle HTTP-specific concerns (routing, status codes)
  - Map between HTTP requests and Application commands/queries
  - Validate requests using domain objects
  - Handle authentication/authorization
  
- **Files** (`Files/`): Web-specific file handling
  - Example: `FormFileUpload.cs`
  - Adapt web framework types to Application abstractions
  - Handle multipart form data
  
- **Services** (`Services/`): Web-specific services
  - Caching, logging, health checks
  - Web-specific configuration providers
  
- **Infrastructure** (`Infrastructure/`): Web app configuration
  - Example: `UploadDirectoryInitializer.cs`
  - Startup services
  - Hosted services

**WHAT DOES NOT BELONG HERE:**
- Business logic (belongs in Domain)
- Data access logic (belongs in Infrastructure)
- Complex application workflows (belongs in Application)

**DEPENDENCIES**: Application, Infrastructure (for DI registration only), SharedKernel.

### Key Design Patterns and Principles

#### 1. CQRS (Command Query Responsibility Segregation)
- **Commands**: Modify state, return success/failure
- **Queries**: Read data, return DTOs
- **Handlers**: One handler per command/query
- **Example**: `AddModelCommand` → `AddModelCommandHandler`

#### 2. Repository Pattern
- **Purpose**: Abstract data access from business logic
- **Interface**: Defined in Application layer (`IModelRepository`)
- **Implementation**: In Infrastructure layer (`ModelRepository`)
- **Benefits**: Testability, technology independence

#### 3. Result Pattern
- **Purpose**: Explicit error handling without exceptions
- **Usage**: All operations that can fail return `Result<T>`
- **Example**: `FileType.ValidateForModelUpload()` returns `Result<FileType>`

#### 4. Value Objects
- **Purpose**: Encapsulate domain concepts with validation
- **Characteristics**: Immutable, equality by value, self-validating
- **Example**: `FileType` with built-in validation and behavior

#### 5. Dependency Inversion
- **Rule**: High-level modules don't depend on low-level modules
- **Implementation**: Application defines interfaces, Infrastructure implements
- **Benefits**: Testability, flexibility, maintainability

### Code Organization Rules

#### Dependencies Flow (Critical Rule)
```
WebApi → Application → Domain ← Infrastructure
              ↓              ↑
         SharedKernel ← ← ← ← ↑
```
- **Domain** and **SharedKernel**: No dependencies on other layers
- **Application**: Only depends on Domain and SharedKernel
- **Infrastructure**: Can depend on all layers
- **WebApi**: Depends on Application and Infrastructure (for DI only)

#### Naming Conventions
- **Commands**: End with `Command` (e.g., `AddModelCommand`)
- **Queries**: End with `Query` (e.g., `GetAllModelsQuery`)
- **Handlers**: End with `Handler` (e.g., `AddModelCommandHandler`)
- **Interfaces**: Start with `I` (e.g., `IModelRepository`)
- **Value Objects**: Descriptive names (e.g., `FileType`, not `FileTypeVO`)

#### File Organization
- **Group by feature**: Related commands, queries, and handlers in same namespace
- **Separate concerns**: Don't mix reading and writing operations
- **Co-locate**: Put related interfaces and implementations near each other

### Testing Strategy by Layer

#### Domain Layer Testing
- **Unit Tests**: Test business logic in isolation
- **Focus Areas**: Entity behavior, value object validation, domain services
- **Example**: Test `FileType.ValidateForModelUpload()` with various file extensions
- **Mock Strategy**: Minimal mocking, pure business logic testing

#### Application Layer Testing
- **Integration Tests**: Test use case orchestration
- **Focus Areas**: Command/query handlers, application services
- **Mock Strategy**: Mock repository interfaces and external services
- **Example**: Test `AddModelCommandHandler` with mocked `IModelRepository`

#### Infrastructure Layer Testing
- **Integration Tests**: Test against real database (in-memory for speed)
- **Focus Areas**: Repository implementations, data mapping
- **Mock Strategy**: Use in-memory database for EF Core testing
- **Example**: Test `ModelRepository.AddAsync()` against real DbContext

#### WebApi Layer Testing
- **Integration Tests**: Test full HTTP pipeline
- **Focus Areas**: Endpoints, request/response mapping, validation
- **Mock Strategy**: Mock application layer services
- **Example**: Test POST `/models` endpoint with file upload

### Common Development Scenarios

#### Adding a New Entity
1. **Domain Layer**:
   ```csharp
   // Domain/Models/NewEntity.cs
   public class NewEntity 
   {
       public static NewEntity Create(/* parameters */) { /* factory logic */ }
       public void UpdateSomething(/* parameters */) { /* business logic */ }
   }
   ```

2. **Application Layer**:
   ```csharp
   // Application/Abstractions/Repositories/INewEntityRepository.cs
   public interface INewEntityRepository 
   {
       Task<NewEntity> AddAsync(NewEntity entity, CancellationToken ct = default);
   }
   ```

3. **Infrastructure Layer**:
   ```csharp
   // Infrastructure/Repositories/NewEntityRepository.cs
   internal sealed class NewEntityRepository : INewEntityRepository
   {
       // Implementation using EF Core
   }
   
   // Infrastructure/Persistence/ApplicationDbContext.cs - Add DbSet
   public DbSet<NewEntity> NewEntities => Set<NewEntity>();
   ```

4. **WebApi Layer**:
   ```csharp
   // WebApi/Endpoints/NewEntityEndpoints.cs
   public static class NewEntityEndpoints
   {
       public static void MapNewEntityEndpoints(this IEndpointRouteBuilder app) { }
   }
   ```

#### Adding a New Use Case (Command/Query)
1. **Define Command/Query**:
   ```csharp
   // Application/NewFeature/DoSomethingCommand.cs
   public record DoSomethingCommand(/* parameters */) : ICommand<DoSomethingResponse>;
   public record DoSomethingResponse(/* response data */);
   ```

2. **Implement Handler**:
   ```csharp
   // Application/NewFeature/DoSomethingCommandHandler.cs
   internal class DoSomethingCommandHandler : ICommandHandler<DoSomethingCommand, DoSomethingResponse>
   {
       public async Task<Result<DoSomethingResponse>> Handle(DoSomethingCommand command, CancellationToken ct)
       {
           // 1. Validate using domain objects
           // 2. Orchestrate domain operations
           // 3. Save changes via repositories
           // 4. Return response
       }
   }
   ```

3. **Expose via Endpoint**:
   ```csharp
   // WebApi/Endpoints/NewFeatureEndpoints.cs
   app.MapPost("/new-feature", async (DoSomethingRequest request, ICommandHandler<DoSomethingCommand, DoSomethingResponse> handler) =>
   {
       var command = new DoSomethingCommand(/* map from request */);
       var result = await handler.Handle(command, cancellationToken);
       return result.IsSuccess ? Results.Ok(result.Value) : Results.BadRequest(result.Error);
   });
   ```

#### Adding a New Value Object
```csharp
// Domain/ValueObjects/NewValueObject.cs
public sealed class NewValueObject : IEquatable<NewValueObject>
{
    public string Value { get; }
    
    private NewValueObject(string value) => Value = value;
    
    public static Result<NewValueObject> Create(string value)
    {
        // Validation logic
        if (string.IsNullOrWhiteSpace(value))
            return Result.Failure<NewValueObject>(new Error("Invalid", "Value cannot be empty"));
            
        return Result.Success(new NewValueObject(value));
    }
    
    // Implement equality, GetHashCode, operators
}
```

### Anti-Patterns to Avoid

#### Domain Layer Violations
❌ **Don't**: Add EF Core attributes directly to entities
```csharp
public class Model
{
    [Key] // Don't do this
    public int Id { get; set; }
}
```
✅ **Do**: Configure in ApplicationDbContext
```csharp
modelBuilder.Entity<Model>(entity =>
{
    entity.HasKey(m => m.Id);
});
```

❌ **Don't**: Reference infrastructure concerns in domain
```csharp
public class Model
{
    public void SaveToDatabase() { /* Don't do this */ }
}
```
✅ **Do**: Keep domain pure, use repositories in application layer

#### Application Layer Violations
❌ **Don't**: Put business logic in command handlers
```csharp
public async Task<Result<AddModelResponse>> Handle(AddModelCommand command, CancellationToken ct)
{
    // Don't validate file types here - that's domain logic
    if (command.File.FileName.EndsWith(".exe"))
        return Result.Failure<AddModelResponse>(new Error("InvalidFile", "EXE files not allowed"));
}
```
✅ **Do**: Use domain objects for validation
```csharp
public async Task<Result<AddModelResponse>> Handle(AddModelCommand command, CancellationToken ct)
{
    var fileTypeResult = FileType.ValidateForModelUpload(command.File.FileName);
    if (!fileTypeResult.IsSuccess)
        return Result.Failure<AddModelResponse>(fileTypeResult.Error);
}
```

#### Infrastructure Layer Violations
❌ **Don't**: Put application logic in repositories
```csharp
public async Task<Model> AddModelWithBusinessLogic(Model model, CancellationToken ct)
{
    // Don't do complex workflows in repositories
    model.ValidateComplexBusinessRules();
    var result = await SomeExternalService.DoSomething();
    // ...
}
```
✅ **Do**: Keep repositories simple and focused
```csharp
public async Task<Model> AddAsync(Model model, CancellationToken ct)
{
    _context.Models.Add(model);
    await _context.SaveChangesAsync(ct);
    return model;
}
```

### Checklist for New Code

Before adding any new code, ask yourself:

#### For Domain Code:
- [ ] Does this represent a core business concept?
- [ ] Does it contain business rules or invariants?
- [ ] Is it free of infrastructure dependencies?
- [ ] Does it use value objects for domain concepts?

#### For Application Code:
- [ ] Does this orchestrate domain objects to fulfill a use case?
- [ ] Does it coordinate multiple repositories/services?
- [ ] Is business logic delegated to domain objects?
- [ ] Are abstractions defined for infrastructure concerns?

#### For Infrastructure Code:
- [ ] Does this implement an Application layer abstraction?
- [ ] Is it focused on external concerns (database, files, APIs)?
- [ ] Does it avoid business logic?
- [ ] Is it easily replaceable/mockable?

#### For WebApi Code:
- [ ] Does this handle HTTP-specific concerns only?
- [ ] Are requests/responses mapped to Application layer types?
- [ ] Is validation done using domain objects?
- [ ] Are complex workflows delegated to Application layer?

## Common Tasks and Architecture

### Key Implementation Details
- **Clean Architecture**: Strict layer separation with dependency inversion
- **Domain-Driven Design**: Rich domain model with entities, value objects, and domain services
- **CQRS Pattern**: Commands for writes, queries for reads with dedicated handlers
- **Result Pattern**: Explicit error handling without exceptions (SharedKernel)
- **Value Objects**: Domain concepts with built-in validation (e.g., `FileType.ValidateForModelUpload()`)
- **Entity Factory Methods**: Controlled object creation (e.g., `Model.Create()`, `File.Create()`)
- **Repository Pattern**: Data access abstraction with Application interfaces, Infrastructure implementations
- **File Storage**: Hash-based deduplication in `Infrastructure/Storage/HashBasedFileStorage`
- **Upload Directory**: Initialization via hosted service in `WebApi/Infrastructure/UploadDirectoryInitializer`
- **Database**: SQL Server with Entity Framework Core, value object conversions
- **Dependency Injection**: Layer-specific registration in `DependencyInjection.cs` files
- **Minimal APIs**: Endpoint mapping in WebApi layer with clear request/response handling

### Environment Configuration
- **RULE #1**: **NEVER override parameters from .env file in docker-compose.yml or other configuration files.** Always use `${VARIABLE_NAME}` syntax to read from .env file to keep the entire project configurable from a single source.
- **RULE #2**: **ALWAYS update .env.example when adding or modifying variables in .env file.** The .env.example file serves as documentation and template for all required environment variables.
- Upload storage path: `UPLOAD_STORAGE_PATH` (defaults to `/var/lib/modelibr/uploads`)
- ASP.NET Core environment: `ASPNETCORE_ENVIRONMENT`
- Database connection string configured in Infrastructure layer
- Frontend API base URL: `VITE_API_BASE_URL` (defaults to `https://localhost:8081`)
- **ALL environment variables are centralized in the main `.env` file** - users should only configure this single file, not separate files for individual projects

#### Environment Variable Priority and Configuration
**ALWAYS prioritize environment variables that are defined in .env files.** If something is parameterized in .env file, use that variable rather than hardcoding values.

Environment variables override configuration values automatically in ASP.NET Core:
- Use double underscore (`__`) to represent nested configuration: `ConnectionStrings__Default`
- Environment variables from .env file take precedence over appsettings.json values
- Docker Compose automatically substitutes `${VARIABLE_NAME}` with values from .env file

#### Frontend Environment Variables
Frontend environment variables (prefixed with `VITE_`) are injected at build time through Docker build arguments:
- `VITE_API_BASE_URL` - Frontend API base URL (from main .env file)
- Docker Compose passes these as build arguments to the frontend container
- **NEVER create separate .env files in src/frontend/ - use only the main .env file**

#### Database Connection String Environment Variables
The database connection string supports environment variable substitution using `Environment.ExpandEnvironmentVariables()`:
- `MSSQL_PORT` - SQL Server port (default: 1433)
- `SA_PASSWORD` - SQL Server SA password (from .env file)
- Format: Use `%VARIABLE_NAME%` syntax in connection strings for environment variable expansion
- Example: `Server=localhost,%MSSQL_PORT%;Database=Modelibr;User Id=sa;Password=%SA_PASSWORD%;TrustServerCertificate=true;`

For development, create .env file from .env.example:
```bash
cp .env.example .env
```

#### Code Simplicity Guidelines
**Keep code as simple, readable, and minimalistic as possible:**
- Avoid unnecessary abstraction layers when environment variables work natively
- Use ASP.NET Core's built-in configuration system rather than custom logic
- Remove duplicate configuration files when one can serve multiple environments
- Leverage framework features (like environment variable overrides) instead of custom code

### Common File Locations
- Main application entry point: `src/WebApi/Program.cs`
- Application setup: `src/Application/DependencyInjection.cs`
- Infrastructure setup: `src/Infrastructure/DependencyInjection.cs`
- Docker configuration: `docker-compose.yml`, `src/WebApi/Dockerfile`
- Launch settings: `src/WebApi/Properties/launchSettings.json`

### Build Timing Expectations
- **NEVER CANCEL BUILDS OR TESTS** - All operations complete quickly
- Package restore: 9-10 seconds
- Full solution build: 9-10 seconds  
- Test execution (with --no-build): 1-2 seconds
- Application startup: 3-4 seconds

### Common Issues and Solutions
- Azure.Core dependency error in tests: Use `dotnet test --no-build` instead of rebuilding
- Permission denied on upload directory: Set `UPLOAD_STORAGE_PATH` to writable location like `/tmp/modelibr/uploads`
- .NET version errors: Ensure .NET 9.0 SDK is installed and in PATH
- Missing packages: Run `dotnet restore Modelibr.sln` to restore all dependencies

### Important: Database Configuration
- **NEVER modify `src/Infrastructure/DependencyInjection.cs` to use in-memory database** - The application is designed to work with SQL Server via Docker Compose
- **NEVER remove connection strings from `src/WebApi/appsettings.Development.json`** - These are required for proper database connectivity
- If database connectivity issues occur, use Docker Compose to start the SQL Server service rather than falling back to in-memory databases
- For development database issues, create a separate GitHub issue to investigate Docker Compose setup

### Development Workflow
1. Make code changes
2. Build: `dotnet build Modelibr.sln` 
3. Test: `dotnet test Modelibr.sln --no-build`
4. Run: `cd src/WebApi && export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads" && dotnet run`
5. Validate application starts and responds on http://localhost:5009

## Documentation Maintenance

### Keeping Documentation Clean and Synchronized

**ALWAYS update both README.md and .github/copilot-instructions.md when making relevant changes.** These files serve different purposes but must stay synchronized to avoid confusion and redundancy.

#### File Responsibilities
- **README.md**: User-facing documentation, getting started guides, feature descriptions, high-level architecture overview
- **.github/copilot-instructions.md**: Developer-focused technical instructions, build details, troubleshooting, environment setup

#### When to Update Documentation
Update both files when changes affect:
- Prerequisites or setup requirements (e.g., .NET version, Node.js version)
- Build or test procedures
- Environment variables or configuration
- Docker setup or deployment
- Project structure or architecture
- Development workflow or debugging procedures

#### Guidelines for Updates
- **Remove redundancy**: Avoid duplicating the same information in both files
- **Keep content focused**: README.md should be accessible to new users; copilot-instructions.md should be comprehensive for developers
- **Maintain consistency**: Use the same versions, commands, and terminology across both files
- **Update examples**: Ensure code examples, URLs, and commands are current and working
- **Validate changes**: Test any instructions you add to ensure they work correctly

#### Content Separation Guidelines
- **README.md should contain**: Features, screenshots, high-level getting started, basic Docker commands, contribution guidelines
- **copilot-instructions.md should contain**: Detailed build instructions with timings, troubleshooting steps, environment variable details, development tips

**Example of good separation:**
- README.md: "Install .NET 9.0 SDK" (with link)
- copilot-instructions.md: "Install .NET 9.0 SDK - REQUIRED (the project targets net9.0): curl command, export PATH, verification steps"