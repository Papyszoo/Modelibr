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
- Known debt + planned refactors live in `.claude/prompts/` (15, 26–29). Before
  reworking error mapping or FileType, read the matching prompt — don't
  half-implement it as a side effect. Transactions/event dispatch (prompt 25) are
  covered below and DONE (every repository migrated except the two permanent,
  individually-justified exceptions) — not a "read the prompt first" item.

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
  `IDomainEventHandler<TEvent>` in `Application/EventHandlers/` — assembly-scanned, no
  registration needed. Raising the event via `RaiseDomainEvent(...)` on an
  `AggregateRoot` is the entire contract.
- Dispatch is NOT manual. `Infrastructure/Persistence/DomainEventsInterceptor.cs` (an EF
  `SaveChangesInterceptor`) collects `DomainEvents` off every tracked `AggregateRoot`
  after a successful commit, dispatches via `IDomainEventDispatcher`, then clears them —
  for every `SaveChangesAsync` call, whoever makes it. **Never call
  `IDomainEventDispatcher.PublishAsync` or `ClearDomainEvents` from a command handler** —
  the interceptor already does it.
- Dispatch is after-commit (side effects only fire for durable state), so raise the
  event before the LAST mutation your handler will save, not after (see
  `CreateModelVersionCommandHandler`). No outbox — the commit/dispatch crash window is
  accepted by design for a local-first app. A handler that stages further writes while
  reacting to an event (e.g. enqueuing a job) gets them flushed automatically — the
  interceptor recurses one more SaveChanges round when changes remain after dispatch.

## Transactions — unit of work
- `IUnitOfWork` (`Application/Abstractions/IUnitOfWork.cs`, one `SaveChangesAsync`
  method) is implemented by `ApplicationDbContext`. Repositories stage mutations
  (`Add`/`Update`/`Remove` on the context) and do **not** call `SaveChangesAsync`
  themselves; command handlers inject `IUnitOfWork` and call `SaveChangesAsync` exactly
  once, after every repo call — that's what makes a multi-repo handler atomic.
- TRAP — a freshly `Add`ed entity's `Id` is an EF temporary placeholder until
  `SaveChangesAsync` runs. If your handler needs the real id for anything that isn't
  just building the same EF change-tracked graph (a raw scalar FK on another entity, a
  response DTO), call `SaveChangesAsync` right after that `Add`, not only at the end —
  see `AddTextureToPackWithFileCommandHandler`.
- TRAP (repository-level, caused a production 500 — PR #568) — a repository's
  `UpdateAsync` must NOT call `_context.Set<T>().Update(entity)` unconditionally.
  `AddAsync` → mutate → `UpdateAsync` on the SAME reference, before any
  `SaveChangesAsync`, is a normal shape (e.g. add an aggregate, add a child to its
  collection, then "update" it) — but the entity is already tracked as `Added` with a
  temporary key, and forcing it to `Modified` throws "has a temporary value while
  attempting to change the entity's state to 'Modified'". Every `UpdateAsync` instead
  calls `_context.UpdateIfDetached(entity)` (`Infrastructure/Persistence/
  DbContextTrackingExtensions.cs`): a no-op when the entity is already tracked (its
  current state — Added or Modified — is what `SaveChangesAsync` will persist), and
  only attaches + marks `Modified` when the entity is genuinely `Detached` (loaded/
  rehydrated outside this context). Use this helper in every new repository's
  `UpdateAsync` — don't reintroduce a bare `.Update(entity)` call.
- Migration is done: every repository under `src/Infrastructure/Repositories` stages
  mutations only. `tests/Infrastructure.Tests/Architecture/RepositoriesDontSelfCommitTests.cs`
  is the live source of truth — its allowlist holds exactly two permanent exceptions
  (`ModelVersionRepository.cs`, `ThumbnailJobRepository.cs`, both justified inline). A
  new repository that self-commits, or a regression in an already-migrated one, fails
  the build; don't add to the allowlist for a new repo — give it `IUnitOfWork` instead.
- `ThumbnailJobRepository.GetNextPendingJobAsync`'s explicit `BeginTransactionAsync`
  (claim semantics) is permanently outside the UoW. `ThumbnailQueue` (the service, not
  the repo) deliberately commits its own writes via `IUnitOfWork` too — enqueue/complete/
  fail/retry are durable-queue primitives that must persist before workers are notified,
  and some callers (the domain-event pipeline) have no command handler to commit
  afterwards. `ApplicationDbContext.SaveChangesAsync` also swallows one specific
  known-benign race (concurrent "add model to pack" duplicating the `PackModels` join
  PK) — name the exact constraint in the `when` clause if you add another.
- A hierarchical delete (categories, and similar branch/tree deletes) that used to issue
  one self-commit per row now lands in a single commit — a failure partway through
  leaves the whole branch untouched instead of a partial delete. That's the atomicity
  guarantee working as intended, not a bug to work around.

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
