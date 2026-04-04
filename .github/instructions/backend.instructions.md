---
name: "Modelibr Backend Instruction"
description: "Use when editing Modelibr backend files in WebApi, Application, Domain, Infrastructure, or SharedKernel. Covers Clean Architecture boundaries, CQRS patterns, reference anchors, and backend verification."
applyTo: "src/WebApi/**, src/Application/**, src/Domain/**, src/Infrastructure/**, src/SharedKernel/**"
---

# Backend Patterns

## Architecture

- Preserve `WebApi -> Application -> Domain <- Infrastructure`; Domain and SharedKernel stay free of EF Core attributes, HTTP concerns, and infrastructure references.
- Use one command or query handler per operation, keep business rules on entities and value objects, and keep repositories thin.

## Result/Error Pattern

- Handlers return `Task<Result>` or `Task<Result<T>>` using `SharedKernel/Result.cs` and `SharedKernel/Error.cs`.
- Check `result.IsSuccess` / `result.IsFailure`; access `result.Value` only on success.
- Create domain-specific errors as `new Error("Code", "Message")`.

## CQRS

- Commands implement `ICommand` or `ICommand<TResponse>` with handlers implementing `ICommandHandler<TCommand>` or `ICommandHandler<TCommand, TResponse>`.
- Queries implement `IQuery<TResponse>` with handlers implementing `IQueryHandler<TQuery, TResponse>`.
- Interfaces live in `Application/Abstractions/Messaging/`.

## Domain Events

- Events extend `DomainEvent` (from SharedKernel), defined in `Domain/Events/`.
- Handlers implement `IDomainEventHandler<TEvent>` in `Application/EventHandlers/`.
- Events are raised on aggregates and published via `IDomainEventDispatcher.PublishAsync()` in the command handler after persistence.

## Validation

- No FluentValidation. Validation is explicit in handlers and domain factory methods.
- Handler-level: validate early, return `Result.Failure(error)` on bad input.
- Domain-level: guard invariants in static `Create()` factories and mutation methods with `ArgumentException`.

## DI Registration

- `Application/DependencyInjection.cs` auto-registers all `ICommandHandler`, `IQueryHandler`, and `IDomainEventHandler` implementations via assembly scanning.
- `Infrastructure/DependencyInjection.cs` registers repositories, `DbContext`, and infrastructure services explicitly.
- New handlers are discovered automatically. New repositories and services require explicit registration.

## Entities and Aggregates

- Entities use `int` IDs (database-assigned). Aggregates extend `AggregateRoot` from SharedKernel.
- Use static `Create()` factory methods with validation for aggregate construction.
- Use private backing fields for collections (`List<T>`) with public `ICollection<T>` properties.

## Repositories

- Interfaces in `Application/Abstractions/Repositories/`; implementations in `Infrastructure/Repositories/`.
- Read queries use `AsNoTracking()`. Writes call `SaveChangesAsync()`.
- Paged queries return `Task<(IEnumerable<T> Items, int TotalCount)>`.

## Minimal API Endpoints

- Endpoints are static classes in `WebApi/Endpoints/` with `Map*Endpoints()` extension methods on `IEndpointRouteBuilder`.
- Handlers are injected directly into endpoint method parameters via DI.
- Map `Result` to HTTP: success → `Results.Ok()`, not found → `Results.NotFound()`, validation/domain failure → `Results.BadRequest(new { error, message })`.

## Testing

- xUnit + Moq. Arrange-Act-Assert pattern. Name tests `Method_When_Condition_Returns_Expected`.
- Unit tests mock repository and service interfaces. Assert `result.IsSuccess` / `result.Error.Code`.
- Integration tests use `WebApplicationFactory<Program>` with `[Trait("Category", "Integration")]`.

## Verification

- Verify backend work with `dotnet build Modelibr.sln` and `dotnet test Modelibr.sln --no-build`.
