---
name: backend-patterns
description: Modelibr backend conventions — Clean Architecture boundaries, Result/Error, CQRS handlers, domain events, validation, DI, repositories, minimal API endpoints, known traps, xUnit naming. Use when creating or editing code under src/WebApi, src/Application, src/Domain, src/Infrastructure, or src/SharedKernel.
---

# Backend patterns (.NET 9, Clean Architecture + DDD)

## Architecture
- Dependency direction: `WebApi → Application → Domain ← Infrastructure`. Domain and
  SharedKernel stay free of EF Core attributes, HTTP concerns, and infrastructure refs.
- One command/query handler per operation; business rules live on entities and value
  objects; repositories stay thin.
- Known debt + planned refactors live in `.claude/prompts/` (15, 25–29). Before
  reworking error mapping, transactions, event dispatch, or FileType, read the
  matching prompt — don't half-implement it as a side effect.

## Result/Error
- Handlers return `Task<Result>` / `Task<Result<T>>` (`SharedKernel/Result.cs`, `Error.cs`).
- Check `IsSuccess`/`IsFailure`; access `.Value` only on success.
- Domain errors: `new Error("Code", "Message")`. `Error` has no type/category field
  (yet — prompt 26), so HTTP status can't be derived from it.

## CQRS
- Commands: `ICommand`/`ICommand<TResponse>` + `ICommandHandler<...>`.
- Queries: `IQuery<TResponse>` + `IQueryHandler<TQuery, TResponse>`.
- Interfaces live in `Application/Abstractions/Messaging/`.

## Domain events
- Extend `DomainEvent` (SharedKernel), defined in `Domain/Events/`; handlers implement
  `IDomainEventHandler<TEvent>` in `Application/EventHandlers/`.
- TRAP — dispatch is manual and easy to forget: after persisting, the command handler
  itself must call `IDomainEventDispatcher.PublishAsync(aggregate.DomainEvents)` then
  `aggregate.ClearDomainEvents()`. If you mutate an aggregate that raises events and
  skip this, the events are silently dropped. (Prompt 25 moves this into the save
  pipeline; until then, copy the pattern from `CreateModelVersionCommandHandler`.)

## Transactions — there is NO unit of work
- Every repository commits internally (`SaveChangesAsync` inside repo methods). A
  handler calling two mutating repo methods = two independent commits; if the second
  fails, the first is already durable. Until prompt 25: keep multi-entity writes
  inside ONE repository method (single SaveChanges), and say so in the PR if you
  can't. `ThumbnailJobRepository` shows the explicit-transaction escape hatch.

## Validation
- No FluentValidation. Handler-level: validate early, return `Result.Failure(error)`.
  Domain-level: guard invariants in static `Create()` factories / mutation methods
  with `ArgumentException`.

## DI
- `Application/DependencyInjection.cs` auto-registers all handler interfaces by
  assembly scan — new handlers need NO registration.
- Repositories/services/DbContext are registered explicitly in
  `Infrastructure/DependencyInjection.cs`.

## Entities, repositories, EF
- `int` IDs (db-assigned); aggregates extend `AggregateRoot`; static `Create()`
  factories; private `List<T>` backing fields behind `ICollection<T>` properties.
- Repo interfaces in `Application/Abstractions/Repositories/`, impls in
  `Infrastructure/Repositories/`. Reads use `AsNoTracking()`; add `AsSplitQuery()`
  when includes span multiple collections. Paged queries return
  `Task<(IEnumerable<T> Items, int TotalCount)>`.
- All EF configuration lives inline in `ApplicationDbContext.OnModelCreating` —
  new entity = config block there + migration.
- Soft-deletable entities need the full trio: `IsDeleted`/`DeletedAt` props,
  `HasQueryFilter(e => !e.IsDeleted)`, and filtered unique indexes
  (`.HasFilter("\"IsDeleted\" = false")`) — copy an existing block.

## Endpoints
- Static classes in `WebApi/Endpoints/` with `Map*Endpoints()` extensions; handlers
  injected as endpoint parameters; always forward the `CancellationToken`.
- Failure body shape is `new { error = result.Error.Code, message = result.Error.Message }`
  — never a bare string. Status mapping is currently ad-hoc per endpoint (mostly 400
  for every failure, some 404) because `Error` is untyped; match the file you're
  editing for consistency. Prompt 26 replaces this with one typed mapping — don't
  invent a third convention.
- Worker-facing upload endpoints (thumbnails, previews, waveforms) must add
  `WorkerApiKeyFilter` (validates `X-Api-Key`; fails closed outside Development).

## Known traps
- **FileType registry**: a new type in `Domain/ValueObjects/FileType.cs` must be
  added to the `AllTypes` registry in the same file — `FileType.FromValue` (the DB
  read side) resolves through it, and `FileTypeRegistryTests` fails the build if a
  static field is missing from the list. Never reintroduce a hand-maintained
  value↔type mapping elsewhere (the old `MapFromDatabaseValue` switch silently
  degraded 19 script types to `Unknown`).
- **Two FileTypes exist**: `Domain.ValueObjects.FileType` (rich VO, 44 values) vs
  `Domain.Files.FileType` (4-value storage-bucket enum used only at upload). Don't
  conflate them.
- **Time**: inject `IDateTimeProvider`; never `DateTime.UtcNow` in new code. Entities
  receive `now` as a method/factory parameter — never inject services into entities.
- **Config**: new settings flow through root `.env` + `.env.example` (env-style key
  names), read via `builder.Configuration` — no hardcoded consts in `Program.cs`.

## Testing
- xUnit + Moq, Arrange-Act-Assert, names `Method_When_Condition_Returns_Expected`.
- Unit tests mock repo/service interfaces; assert `result.IsSuccess` / `result.Error.Code`.
- Integration tests: `WebApplicationFactory<Program>` + `[Trait("Category", "Integration")]`
  (excluded from the default suite; run via the `backend-integration` suite, which
  starts dev Postgres itself). Gotcha: Program.Main reads `RESTORE_STORAGE_PATH` /
  `THUMBNAIL_STORAGE_PATH` BEFORE host config applies — in-process tests must set
  them as environment variables (see `ModelibrWebFactory`).

## Verify
`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"`
