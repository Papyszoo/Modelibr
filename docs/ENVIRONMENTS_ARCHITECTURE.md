# Environments Feature - Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React/TypeScript)                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐ │
│  │ ModelPreviewScene  │  │  ViewerSettings     │  │ EnvironmentsMan- │ │
│  │                    │  │                     │  │      ager        │ │
│  │ - Loads env by ID  │  │ - Env selector     │  │                  │ │
│  │ - Applies to Stage │  │ - Dropdown widget  │  │ - DataTable      │ │
│  │ - Falls back to    │  │ - Load envs list   │  │ - Create/Edit UI │ │
│  │   default          │  │                     │  │ - Delete/Default │ │
│  └────────┬───────────┘  └──────────┬──────────┘  └────────┬─────────┘ │
│           │                         │                      │           │
│           └─────────────────────────┴──────────────────────┘           │
│                                     │                                   │
│                          ┌──────────▼──────────┐                       │
│                          │     ApiClient       │                       │
│                          │                     │                       │
│                          │ - getEnvironments() │                       │
│                          │ - getEnvById(id)    │                       │
│                          │ - createEnvironment │                       │
│                          │ - updateEnvironment │                       │
│                          │ - setDefault(id)    │                       │
│                          │ - deleteEnvironment │                       │
│                          └──────────┬──────────┘                       │
└─────────────────────────────────────┼────────────────────────────────────┘
                                      │ HTTP/REST
                                      │
┌─────────────────────────────────────▼────────────────────────────────────┐
│                         WEBAPI LAYER (.NET 9.0)                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│                      ┌────────────────────────────┐                      │
│                      │  EnvironmentsEndpoints     │                      │
│                      │                            │                      │
│                      │  GET    /environments      │                      │
│                      │  GET    /environments/{id} │                      │
│                      │  POST   /environments      │                      │
│                      │  PUT    /environments/{id} │                      │
│                      │  POST   /environments/{id}/set-default           │
│                      │  DELETE /environments/{id} │                      │
│                      └──────────────┬─────────────┘                      │
│                                     │                                    │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ CQRS
                                      │
┌─────────────────────────────────────▼──────────────────────────────────┐
│                      APPLICATION LAYER (Use Cases)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────┐  ┌────────────────────────────────┐ │
│  │        COMMANDS              │  │         QUERIES                │ │
│  │                              │  │                                │ │
│  │ • CreateEnvironmentCommand   │  │ • GetAllEnvironmentsQuery     │ │
│  │ • UpdateEnvironmentCommand   │  │ • GetEnvironmentByIdQuery     │ │
│  │ • DeleteEnvironmentCommand   │  │                                │ │
│  │ • SetDefaultEnvironmentCmd   │  │                                │ │
│  └──────────────┬───────────────┘  └────────────┬───────────────────┘ │
│                 │                                │                     │
│                 └────────────────┬───────────────┘                     │
│                                  │                                     │
│                    ┌─────────────▼────────────────┐                    │
│                    │  IEnvironmentRepository      │                    │
│                    │  (Interface)                 │                    │
│                    └─────────────┬────────────────┘                    │
└──────────────────────────────────┼───────────────────────────────────┘
                                   │ Dependency Inversion
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│                    INFRASTRUCTURE LAYER (Data Access)                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              EnvironmentRepository                             │ │
│  │                                                                 │ │
│  │  • AddAsync(environment)                                       │ │
│  │  • GetAllAsync() → ordered by IsDefault, Name                 │ │
│  │  • GetByIdAsync(id)                                           │ │
│  │  • GetDefaultAsync() → first where IsDefault                  │ │
│  │  • GetByNameAsync(name)                                       │ │
│  │  • UpdateAsync(environment)                                   │ │
│  │  • DeleteAsync(id)                                            │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │                                      │
│                  ┌────────────▼──────────────┐                      │
│                  │  ApplicationDbContext      │                      │
│                  │  DbSet<Environment>        │                      │
│                  └────────────┬───────────────┘                      │
│                               │                                      │
│            ┌──────────────────▼──────────────────────┐              │
│            │    DatabaseExtensions (Seeding)         │              │
│            │                                          │              │
│            │  • SeedDefaultEnvironmentAsync()        │              │
│            │  • Creates "Stage" if no envs exist    │              │
│            └──────────────────┬───────────────────────┘              │
└───────────────────────────────┼──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                         DOMAIN LAYER (Business Logic)                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      Environment                              │   │
│  │                                                               │   │
│  │  Properties:                                                  │   │
│  │  • Id, Name, Description, IsDefault                          │   │
│  │  • LightIntensity, EnvironmentPreset                         │   │
│  │  • ShowShadows, ShadowType, ShadowOpacity, ShadowBlur       │   │
│  │  • AutoAdjustCamera, CameraDistance, CameraAngle            │   │
│  │  • BackgroundModelId                                         │   │
│  │  • CreatedAt, UpdatedAt                                      │   │
│  │                                                               │   │
│  │  Factory Methods:                                             │   │
│  │  • Create(...) → validates and creates new environment       │   │
│  │  • CreateDefaultStage() → creates "Stage" environment        │   │
│  │                                                               │   │
│  │  Business Methods:                                            │   │
│  │  • UpdateName(name, date)                                    │   │
│  │  • UpdateDescription(desc, date)                             │   │
│  │  • UpdateLightingSettings(...)                              │   │
│  │  • UpdateShadowSettings(...)                                │   │
│  │  • UpdateCameraSettings(...)                                │   │
│  │  • SetAsDefault(date)                                        │   │
│  │  • UnsetAsDefault(date)                                      │   │
│  │  • SetBackgroundModel(id, date)                             │   │
│  │                                                               │   │
│  │  Validation:                                                  │   │
│  │  • Name: required, max 100 chars                             │   │
│  │  • LightIntensity: 0-10                                      │   │
│  │  • EnvironmentPreset: must be valid preset                   │   │
│  │  • ShadowOpacity: 0-1                                        │   │
│  │  • ShadowBlur: 0-10                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                           DATABASE (PostgreSQL)                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Environments Table:                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Id (SERIAL PRIMARY KEY)                                         │ │
│  │ Name (VARCHAR(100) UNIQUE NOT NULL)                             │ │
│  │ Description (VARCHAR(500))                                      │ │
│  │ IsDefault (BOOLEAN NOT NULL) [INDEXED]                         │ │
│  │ LightIntensity (DOUBLE PRECISION NOT NULL)                      │ │
│  │ EnvironmentPreset (VARCHAR(50) NOT NULL)                        │ │
│  │ ShowShadows (BOOLEAN NOT NULL)                                  │ │
│  │ ShadowType (VARCHAR(50))                                        │ │
│  │ ShadowOpacity (DOUBLE PRECISION NOT NULL)                       │ │
│  │ ShadowBlur (DOUBLE PRECISION NOT NULL)                          │ │
│  │ AutoAdjustCamera (BOOLEAN NOT NULL)                             │ │
│  │ CameraDistance (DOUBLE PRECISION)                               │ │
│  │ CameraAngle (DOUBLE PRECISION)                                  │ │
│  │ BackgroundModelId (INTEGER)                                     │ │
│  │ CreatedAt (TIMESTAMP NOT NULL)                                  │ │
│  │ UpdatedAt (TIMESTAMP NOT NULL)                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Default Seed Data:                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Name: "Stage"                                                   │ │
│  │ Description: "Default stage environment with city lighting"     │ │
│  │ IsDefault: true                                                 │ │
│  │ LightIntensity: 0.5                                             │ │
│  │ EnvironmentPreset: "city"                                       │ │
│  │ ShowShadows: true                                               │ │
│  │ ShadowType: "contact"                                           │ │
│  │ ShadowOpacity: 0.4                                              │ │
│  │ ShadowBlur: 2                                                   │ │
│  │ AutoAdjustCamera: false                                         │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User Action (Create Environment):                                     │
│  1. User fills form in EnvironmentsManager                             │
│  2. ApiClient.createEnvironment(data) → POST /environments             │
│  3. EnvironmentsEndpoints receives request                             │
│  4. CreateEnvironmentCommandHandler.Handle()                           │
│  5. Environment.Create() validates and creates entity                  │
│  6. EnvironmentRepository.AddAsync() saves to DB                       │
│  7. Response sent back to frontend                                     │
│  8. UI refreshes environment list                                      │
│                                                                         │
│  Model View (Apply Environment):                                       │
│  1. User selects environment in ViewerSettings                         │
│  2. Settings passed to ModelPreviewScene                               │
│  3. Scene loads environment: ApiClient.getEnvironmentById()            │
│  4. Environment settings applied to Three.js Stage component:          │
│     - intensity={env.lightIntensity}                                   │
│     - environment={env.environmentPreset}                              │
│     - shadows={{type, opacity, blur}}                                  │
│  5. 3D model rendered with environment settings                        │
│                                                                         │
│  Database Startup:                                                     │
│  1. Application starts                                                 │
│  2. DatabaseExtensions.InitializeDatabaseAsync()                       │
│  3. Migrations applied                                                 │
│  4. SeedDefaultEnvironmentAsync() checks for environments              │
│  5. If empty, creates default "Stage" environment                      │
│  6. Application ready                                                  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘

DESIGN PATTERNS USED:
━━━━━━━━━━━━━━━━━━━━━━
✓ Clean Architecture (Onion Architecture)
✓ Domain-Driven Design (DDD)
✓ CQRS (Command Query Responsibility Segregation)
✓ Repository Pattern
✓ Factory Pattern (Environment.Create, Environment.CreateDefaultStage)
✓ Result Pattern (for error handling)
✓ Dependency Inversion Principle
✓ Single Responsibility Principle

ENVIRONMENT PRESETS:
━━━━━━━━━━━━━━━━━━━━
city, dawn, forest, lobby, night, park, studio, sunset, warehouse
(HDR environment maps for realistic lighting and reflections)
```
