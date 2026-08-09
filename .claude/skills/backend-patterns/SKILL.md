---
name: backend-patterns
description: Modelibr backend conventions — Clean Architecture boundaries, Result/Error, CQRS handler shapes, validation, DI auto-registration, minimal API endpoint style and failure body shape, FileType registry and time/config traps, xUnit naming. Use when creating or editing code under src/WebApi, src/Application, src/Domain, or src/SharedKernel. For repositories, EF Core, unit of work, or domain-event dispatch use backend-persistence.
---

# Backend patterns (.NET 9, Clean Architecture + DDD)

## Architecture

- Dependency direction: `WebApi → Application → Domain ← Infrastructure`. Domain
  and SharedKernel stay free of EF Core attributes, HTTP concerns, and
  infrastructure refs.
- One command/query handler per operation; business rules live on entities and
  value objects; repositories stay thin.
- Known debt + planned refactors are queued as prompts (15, 26–29). Before
  reworking error mapping or FileType, read the matching prompt — don't
  half-implement it as a side effect.

## Result/Error

- Handlers return `Task<Result>` / `Task<Result<T>>` (`SharedKernel/Result.cs`,
  `Error.cs`).
- Check `IsSuccess`/`IsFailure`; access `.Value` only on success.
- Domain errors: `new Error("Code", "Message")`. `Error` has no type/category
  field (yet — prompt 26), so HTTP status can't be derived from it.

## CQRS

- Commands: `ICommand`/`ICommand<TResponse>` + `ICommandHandler<...>`.
- Queries: `IQuery<TResponse>` + `IQueryHandler<TQuery, TResponse>`.
- Interfaces live in `Application/Abstractions/Messaging/`.
- Persistence side (unit of work, domain events, repositories): see
  `backend-persistence`.

## Validation

No FluentValidation. Handler-level: validate early, return
`Result.Failure(error)`. Domain-level: guard invariants in static `Create()`
factories / mutation methods with `ArgumentException`.

## DI

- `Application/DependencyInjection.cs` auto-registers all handler interfaces by
  assembly scan — new handlers need NO registration.
- Repositories/services/DbContext are registered explicitly in
  `Infrastructure/DependencyInjection.cs`.

## Endpoints

- Static classes in `WebApi/Endpoints/` with `Map*Endpoints()` extensions;
  handlers injected as endpoint parameters; always forward the
  `CancellationToken`.
- Failure body shape is
  `new { error = result.Error.Code, message = result.Error.Message }` — never a
  bare string. Status mapping is currently ad-hoc per endpoint (mostly 400 for
  every failure, some 404) because `Error` is untyped; match the file you're
  editing for consistency. Prompt 26 replaces this with one typed mapping — don't
  invent a third convention.
- Worker-facing upload endpoints (thumbnails, previews, waveforms) must add
  `WorkerApiKeyFilter` (validates `X-Api-Key`; fails closed outside Development).
- No raw EF, SHA-256, or `Domain.Events` in WebApi — the one surviving violation
  (WebDAV blend-save middleware) is prompt 32's job, not a precedent.

## Known traps

- **FileType registry**: a new type in `Domain/ValueObjects/FileType.cs` must be
  added to the `AllTypes` registry in the same file — `FileType.FromValue` (the DB
  read side) resolves through it, and `FileTypeRegistryTests` fails the build if a
  static field is missing from the list. Never reintroduce a hand-maintained
  value↔type mapping elsewhere (the old `MapFromDatabaseValue` switch silently
  degraded 19 script types to `Unknown` — and shipped in v0.3.0 with all tests
  green).
- **Two FileTypes exist**: `Domain.ValueObjects.FileType` (rich VO, 44 values) vs
  `Domain.Files.FileType` (4-value storage-bucket enum used only at upload). Don't
  conflate them.
- **Time**: inject `IDateTimeProvider`; never `DateTime.UtcNow` in new code.
  Entities receive `now` as a method/factory parameter — never inject services
  into entities.
- **Config**: new settings flow through root `.env` + `.env.example` (env-style
  key names), read via `builder.Configuration` — no hardcoded consts in
  `Program.cs`.

## Testing

- xUnit + Moq, Arrange-Act-Assert, names
  `Method_When_Condition_Returns_Expected`.
- Unit tests mock repo/service interfaces; assert `result.IsSuccess` /
  `result.Error.Code`. **Mocks only above the repository line; InMemory is not
  evidence of Postgres behavior.**
- Integration tests: `WebApplicationFactory<Program>` +
  `[Trait("Category", "Integration")]` (excluded from the default suite; run via
  the `backend-integration` suite, which starts dev Postgres itself). Gotcha:
  `Program.Main` reads `RESTORE_STORAGE_PATH` / `THUMBNAIL_STORAGE_PATH` BEFORE
  host config applies — in-process tests must set them as environment variables
  (see `ModelibrWebFactory`).

## Verify

`dotnet build Modelibr.sln && dotnet test Modelibr.sln --no-build --filter "Category!=Integration"`
