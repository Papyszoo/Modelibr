---
name: backend-patterns
description: Modelibr backend conventions — Clean Architecture boundaries, Result/Error, CQRS handlers, domain events, validation, DI, repositories, minimal API endpoints, xUnit naming. Use when creating or editing code under src/WebApi, src/Application, src/Domain, src/Infrastructure, or src/SharedKernel.
---

# Backend patterns (.NET 9, Clean Architecture + DDD)

## Architecture
- Dependency direction: `WebApi → Application → Domain ← Infrastructure`. Domain and
  SharedKernel stay free of EF Core attributes, HTTP concerns, and infrastructure refs.
- One command/query handler per operation; business rules live on entities and value
  objects; repositories stay thin.

## Result/Error
- Handlers return `Task<Result>` / `Task<Result<T>>` (`SharedKernel/Result.cs`, `Error.cs`).
- Check `IsSuccess`/`IsFailure`; access `.Value` only on success.
- Domain errors: `new Error("Code", "Message")`.

## CQRS
- Commands: `ICommand`/`ICommand<TResponse>` + `ICommandHandler<...>`.
- Queries: `IQuery<TResponse>` + `IQueryHandler<TQuery, TResponse>`.
- Interfaces live in `Application/Abstractions/Messaging/`.

## Domain events
- Extend `DomainEvent` (SharedKernel), defined in `Domain/Events/`.
- Handlers implement `IDomainEventHandler<TEvent>` in `Application/EventHandlers/`.
- Raised on aggregates; published via `IDomainEventDispatcher.PublishAsync()` in the
  command handler AFTER persistence.

## Validation
- No FluentValidation. Handler-level: validate early, return `Result.Failure(error)`.
  Domain-level: guard invariants in static `Create()` factories / mutation methods
  with `ArgumentException`.

## DI
- `Application/DependencyInjection.cs` auto-registers all handler interfaces by
  assembly scan — new handlers need NO registration.
- Repositories/services/DbContext are registered explicitly in
  `Infrastructure/DependencyInjection.cs`.

## Entities, repositories, endpoints
- `int` IDs (db-assigned); aggregates extend `AggregateRoot`; static `Create()`
  factories; private `List<T>` backing fields behind `ICollection<T>` properties.
- Repo interfaces in `Application/Abstractions/Repositories/`, impls in
  `Infrastructure/Repositories/`. Reads use `AsNoTracking()`; paged queries return
  `Task<(IEnumerable<T> Items, int TotalCount)>`.
- Endpoints: static classes in `WebApi/Endpoints/` with `Map*Endpoints()` extensions;
  handlers injected as endpoint parameters. Result→HTTP: success `Ok()`, not found
  `NotFound()`, validation/domain failure `BadRequest(new { error, message })`.

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
