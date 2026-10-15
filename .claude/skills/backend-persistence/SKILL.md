---
name: backend-persistence
description: Modelibr EF Core persistence rules - the IUnitOfWork contract (repositories never self-commit), the automatic after-commit domain-event interceptor, temporary-key and UpdateIfDetached traps that caused production 500s, entity/repository/soft-delete conventions, and the arch tests that enforce them. Use when creating or editing anything under src/Infrastructure/Repositories or Persistence, adding an entity or migration, or raising domain events.
---

# Backend persistence (EF Core, unit of work, domain events)

## Domain events - dispatch is NOT manual

- Extend `DomainEvent` (`Domain/Events/`); handlers implement
  `IDomainEventHandler<TEvent>` in `Application/EventHandlers/` -
  assembly-scanned, no registration. `RaiseDomainEvent(...)` on an
  `AggregateRoot` is the entire contract.
- `Infrastructure/Persistence/DomainEventsInterceptor.cs` (an EF
  `SaveChangesInterceptor`) collects `DomainEvents` off every tracked
  `AggregateRoot` after a successful commit, dispatches via
  `IDomainEventDispatcher`, then clears them - for every `SaveChangesAsync`.
  **Never call `IDomainEventDispatcher.PublishAsync` or `ClearDomainEvents` from
  a command handler** - the interceptor already does it.
- Dispatch is after-commit, so **raise the event before the LAST mutation your
  handler will save** (see `CreateModelVersionCommandHandler`). No outbox - the
  commit/dispatch crash window is accepted for a local-first app. A handler that
  stages further writes while reacting (e.g. enqueuing a job) gets them flushed -
  the interceptor recurses one more SaveChanges round.

## Transactions - unit of work

- `IUnitOfWork` (`Application/Abstractions/IUnitOfWork.cs`: `SaveChangesAsync` +
  `InTransactionAsync`) is implemented by `ApplicationDbContext` and resolved
  through `PostCommitUnitOfWork`, a decorator that drains `IPostCommitActions` at
  the outermost commit. Repositories stage mutations (`Add`/`Update`/`Remove`)
  and do **not** call `SaveChangesAsync`; command handlers inject `IUnitOfWork`
  and call it exactly once, after every repo call - that makes a multi-repo
  handler atomic.
- **TRAP - temporary keys.** A freshly `Add`ed entity's `Id` is an EF temporary
  placeholder until `SaveChangesAsync` runs. If your handler needs the real id
  for anything but the tracked graph (a raw scalar FK, a response DTO), call
  `SaveChangesAsync` right after that `Add` - see
  `AddTextureToPackWithFileCommandHandler`.
- **TRAP - `UpdateIfDetached` (caused a production 500, PR #568).** `UpdateAsync`
  must NOT call `_context.Set<T>().Update(entity)` unconditionally: `AddAsync` →
  mutate → `UpdateAsync` on the SAME reference is normal, but the entity is
  already tracked as `Added` with a temporary key and forcing `Modified` throws.
  Call `_context.UpdateIfDetached(entity)`
  (`Infrastructure/Persistence/DbContextTrackingExtensions.cs`): a no-op when
  tracked, attaching + `Modified` only when genuinely `Detached`. **Use this in
  every new repository's `UpdateAsync`; never a bare `.Update(entity)`.**
- Migration is done: every `Infrastructure/Repositories` repo stages mutations
  only. `RepositoriesDontSelfCommitTests.cs` is the source of truth - its
  allowlist has exactly two justified exceptions (`ModelVersionRepository.cs`,
  `ThumbnailJobRepository.cs`). A new self-committing repo fails the build;
  **don't extend the allowlist - give it `IUnitOfWork`.**
- `ThumbnailJobRepository.GetNextPendingJobAsync`'s `BeginTransactionAsync`
  (claim semantics) is permanently outside the UoW. `ThumbnailQueue` commits its
  own durable writes (enqueue/complete/fail/retry must persist before workers are
  notified). Pack membership uses `IPackRepository.EnsureModelInPackAsync`
  (`INSERT ... ON CONFLICT DO NOTHING`) inside an active `InTransactionAsync`.
- **Side effects wait for the commit: `IPostCommitActions`.** A handler that
  invalidates a cache, enqueues work or notifies a worker would otherwise point
  another process at pre-commit state (and emit on rollback). Call
  `IPostCommitActions.Enqueue(...)` BEFORE the save that commits; the decorator
  drains the queue after the outermost commit and discards it on rollback; a
  throwing action is logged, not surfaced. **A throw is not a rollback** -
  `SaveDurabilityInterceptor` (registered FIRST, ahead of
  `DomainEventsInterceptor`) decides which side of persistence a failure landed
  on, and the drain runs on `CancellationToken.None` so a hung-up client can't
  silence a worker notification. A new repo that opens its own transaction AND
  rolls it back breaks this - give new repos `IUnitOfWork`.

## Entities, repositories, EF

- `int` IDs (db-assigned); aggregates extend `AggregateRoot`; static `Create()`
  factories; private `List<T>` backing fields behind `ICollection<T>`.
- Repo interfaces in `Application/Abstractions/Repositories/`, impls in
  `Infrastructure/Repositories/`. Reads use `AsNoTracking()`; **add
  `AsSplitQuery()` when includes span multiple collections** - there is no global
  split-query default. Paged queries return
  `Task<(IEnumerable<T> Items, int TotalCount)>`.
- All EF config lives inline in `ApplicationDbContext.OnModelCreating` - new
  entity = config block there + migration.
- Soft-deletable entities need the full trio: `IsDeleted`/`DeletedAt`,
  `HasQueryFilter(e => !e.IsDeleted)`, and filtered unique indexes
  (`.HasFilter("\"IsDeleted\" = false")`).

## Services outside the command pipeline

A service in `Infrastructure/Services` that stages repo mutations has **no
command handler to commit for it**. `ServicesCommitStagedMutationsTests` gates
this - `BlenderInstallationService.PersistSettingsAsync` silently dropped
`BlenderEnabled` until then. `CommandHandlerUnitOfWorkDecorator` commits on
success around every command handler and is arch-test-pinned.

## Verify

`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"`
Mocked unit tests can't see the regression classes a persistence refactor
produces - **run the fast e2e lane locally before opening the PR.**
