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
  - Environment variables in `.env.example`

## Validation
- ALWAYS manually test the Web API after changes by running `dotnet run` and verifying it starts successfully
- Test the upload endpoint: `curl -X POST -F "file=@test.txt" http://localhost:5009/uploadModel`
- ALWAYS build with `dotnet build Modelibr.sln` before committing changes
- Use `dotnet test Modelibr.sln --no-build` to run tests without rebuild issues

## Common Tasks and Architecture

### Project Structure
The solution follows Clean Architecture with the following projects:
- `src/Domain/` - Domain entities and core business logic
- `src/Application/` - Application services and use cases  
- `src/Infrastructure/` - Data access and external services (Entity Framework, SQL Server)
- `src/SharedKernel/` - Shared domain primitives and common types
- `src/WebApi/` - ASP.NET Core Web API presentation layer
- `tests/Infrastructure.Tests/` - Unit tests for infrastructure layer

### Key Implementation Details
- File storage uses hash-based deduplication in `Infrastructure/Storage/HashBasedFileStorage`
- Upload directory initialization in `WebApi/Infrastructure/UploadDirectoryInitializer`
- Command/Query pattern with mediator in Application layer
- Result pattern for error handling in SharedKernel
- SQL Server database with Entity Framework Core

### Environment Configuration
- Upload storage path: `UPLOAD_STORAGE_PATH` (defaults to `/var/lib/modelibr/uploads`)
- ASP.NET Core environment: `ASPNETCORE_ENVIRONMENT`
- Database connection string configured in Infrastructure layer
- Docker environment variables in `.env.example`

#### Environment Variable Priority and Configuration
**ALWAYS prioritize environment variables that are defined in .env files.** If something is parameterized in .env file, use that variable rather than hardcoding values.

Environment variables override configuration values automatically in ASP.NET Core:
- Use double underscore (`__`) to represent nested configuration: `ConnectionStrings__Default`
- Environment variables from .env file take precedence over appsettings.json values
- Docker Compose automatically substitutes `${VARIABLE_NAME}` with values from .env file

#### Database Connection String Environment Variables
The database connection string supports environment variable substitution:
- `MSSQL_PORT` - SQL Server port (default: 1433)
- `SA_PASSWORD` - SQL Server SA password (from .env file)
- Example: `Server=mssql,${MSSQL_PORT};Database=Modelibr;User Id=sa;Password=${SA_PASSWORD};TrustServerCertificate=true;`

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

### Development Workflow
1. Make code changes
2. Build: `dotnet build Modelibr.sln` 
3. Test: `dotnet test Modelibr.sln --no-build`
4. Run: `cd src/WebApi && export UPLOAD_STORAGE_PATH="/tmp/modelibr/uploads" && dotnet run`
5. Validate application starts and responds on http://localhost:5009