---
name: backend-persistence
description: Modelibr EF Core persistence rules - the IUnitOfWork contract (repositories never self-commit), the automatic after-commit domain-event interceptor, temporary-key and UpdateIfDetached traps that caused production 500s, entity/repository/soft-delete conventions, and the arch tests that enforce them. Use when creating or editing anything under src/Infrastructure/Repositories or Persistence, adding an entity or migration, or raising domain events.
---

# Backend persistence (EF Core, unit of work, domain events)

## Domain events - dispatch is NOT manual

- Extend `DomainEvent` (SharedKernel), defined in `Domain/Events/`; handlers
  implement `IDomainEventHandler<TEvent>` in `Application/EventHandlers/` -
  assembly-scanned, no registration needed. Raising the event via
  `RaiseDomainEvent(...)` on an `AggregateRoot` is the entire contract.
- `Infrastructure/Persistence/DomainEventsInterceptor.cs` (an EF
  `SaveChangesInterceptor`) collects `DomainEvents` off every tracked
  `AggregateRoot` after a successful commit, dispatches via
  `IDomainEventDispatcher`, then clears them - for every `SaveChangesAsync` call,
  whoever makes it. **Never call `IDomainEventDispatcher.PublishAsync` or
  `ClearDomainEvents` from a command handler** - the interceptor already does it.
- Dispatch is after-commit (side effects only fire for durable state), so **raise
  the event before the LAST mutation your handler will save**, not after (see
  `CreateModelVersionCommandHandler`). No outbox - the commit/dispatch crash
  window is accepted by design for a local-first app. A handler that stages
  further writes while reacting to an event (e.g. enqueuing a job) gets them
  flushed automatically - the interceptor recurses one more SaveChanges round
  when changes remain after dispatch.

## Transactions - unit of work

- `IUnitOfWork` (`Application/Abstractions/IUnitOfWork.cs`: `SaveChangesAsync` plus
  `InTransactionAsync`) is implemented by `ApplicationDbContext` and **resolved through
  `PostCommitUnitOfWork`**, a thin decorator that adds one thing - draining
  `IPostCommitActions` at the outermost commit (see below). Repositories stage mutations
  (`Add`/`Update`/`Remove` on the context) and do **not** call `SaveChangesAsync`
  themselves; command handlers inject `IUnitOfWork` and call `SaveChangesAsync`
  exactly once, after every repo call - that's what makes a multi-repo handler
  atomic.
- **TRAP - temporary keys.** A freshly `Add`ed entity's `Id` is an EF temporary
  placeholder until `SaveChangesAsync` runs. If your handler needs the real id for
  anything that isn't just building the same EF change-tracked graph (a raw scalar
  FK on another entity, a response DTO), call `SaveChangesAsync` right after that
  `Add`, not only at the end - see `AddTextureToPackWithFileCommandHandler`.
- **TRAP - `UpdateIfDetached` (caused a production 500, PR #568).** A repository's
  `UpdateAsync` must NOT call `_context.Set<T>().Update(entity)` unconditionally.
  `AddAsync` → mutate → `UpdateAsync` on the SAME reference, before any
  `SaveChangesAsync`, is a normal shape (add an aggregate, add a child to its
  collection, then "update" it) - but the entity is already tracked as `Added`
  with a temporary key, and forcing it to `Modified` throws "has a temporary value
  while attempting to change the entity's state to 'Modified'". Every
  `UpdateAsync` instead calls `_context.UpdateIfDetached(entity)`
  (`Infrastructure/Persistence/DbContextTrackingExtensions.cs`): a no-op when the
  entity is already tracked (its current state - Added or Modified - is what
  `SaveChangesAsync` will persist), attaching + marking `Modified` only when the
  entity is genuinely `Detached`. **Use this helper in every new repository's
  `UpdateAsync`; never reintroduce a bare `.Update(entity)`.**
- Migration is done: every repository under `src/Infrastructure/Repositories`
  stages mutations only.
  `tests/Infrastructure.Tests/Architecture/RepositoriesDontSelfCommitTests.cs` is
  the live source of truth - its allowlist holds exactly two permanent exceptions
  (`ModelVersionRepository.cs`, `ThumbnailJobRepository.cs`, both justified
  inline). A new repository that self-commits, or a regression in an
  already-migrated one, fails the build; **don't add to the allowlist for a new
  repo - give it `IUnitOfWork` instead.**
- `ThumbnailJobRepository.GetNextPendingJobAsync`'s explicit
  `BeginTransactionAsync` (claim semantics) is permanently outside the UoW.
  `ThumbnailQueue` (the service, not the repo) deliberately commits its own writes
  via `IUnitOfWork` too - enqueue/complete/fail/retry are durable-queue primitives
  that must persist before workers are notified, and some callers (the
  domain-event pipeline) have no command handler to commit afterwards.
  `ApplicationDbContext.SaveChangesAsync` also swallows one specific known-benign
  race (concurrent "add model to pack" duplicating the `PackModels` join PK) -
  name the exact constraint in the `when` clause if you add another.
- **Side effects wait for the commit: `IPostCommitActions`.** A handler that invalidates a
  cache, enqueues background work or notifies a worker is telling another process to go and
  read state - so doing it inside the transaction points it at state that is not there yet,
  and a rollback emits the effect for a write that never existed. `bind_texture_set` hit
  this: the blend consumer is a singleton with its own scope, so it could take the queue
  entry, read the pre-commit bindings and cache a `.blend` built from them, which the later
  duplicate entry then returned. Inject `IPostCommitActions` and `Enqueue(description, …)`
  instead of acting; the decorator runs the queue after the outermost commit (immediately
  after the save when no transaction is open) and discards it on rollback. An action that
  throws is logged, never surfaced - the write it describes is already durable. Enqueue
  BEFORE the save that commits, not after it - and the two consequences of enqueuing first:
  a save that THROWS takes its own registrations back (everything no earlier save in the
  scope claimed), so a later successful save cannot drain a notification for a row that was
  never written; and the drain runs on `CancellationToken.None`, because once the write is
  durable the request's token governs nothing and a client hanging up must not silence the
  only notification a worker gets. A rollback still discards everything registered inside
  the transaction, including what a nested save had already committed into it.
- A hierarchical delete (categories, and similar branch/tree deletes) that used to
  issue one self-commit per row now lands in a single commit - a failure partway
  through leaves the whole branch untouched instead of a partial delete. That's
  the atomicity guarantee working as intended, not a bug to work around.

## Entities, repositories, EF

- `int` IDs (db-assigned); aggregates extend `AggregateRoot`; static `Create()`
  factories; private `List<T>` backing fields behind `ICollection<T>` properties.
- Repo interfaces in `Application/Abstractions/Repositories/`, impls in
  `Infrastructure/Repositories/`. Reads use `AsNoTracking()`; **add
  `AsSplitQuery()` when includes span multiple collections** - there is no global
  split-query default, so a multi-collection include without it is a cartesian
  product waiting to happen. Paged queries return
  `Task<(IEnumerable<T> Items, int TotalCount)>`.
- All EF configuration lives inline in `ApplicationDbContext.OnModelCreating` -
  new entity = config block there + migration.
- Soft-deletable entities need the full trio: `IsDeleted`/`DeletedAt` props,
  `HasQueryFilter(e => !e.IsDeleted)`, and filtered unique indexes
  (`.HasFilter("\"IsDeleted\" = false")`) - copy an existing block.

## Services outside the command pipeline

A service in `Infrastructure/Services` that stages repo mutations has **no command
handler to commit for it**. `ServicesCommitStagedMutationsTests` gates this
(staging mutations must reference `IUnitOfWork`) after
`BlenderInstallationService.PersistSettingsAsync` silently dropped
`BlenderEnabled` and shipped in 0.4.0. `CommandHandlerUnitOfWorkDecorator` commits
on success around every command handler and is arch-test-pinned.

## Verify

`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"`

Mocked unit tests cannot see the regression classes a persistence refactor
produces - **run the fast e2e lane locally before opening the PR.**
