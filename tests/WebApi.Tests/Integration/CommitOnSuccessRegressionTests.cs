using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.TextureSets;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Regression coverage for the two commit-related failure classes fixed
/// alongside PR #568 (feat/unit-of-work): (1) a handler whose only commit
/// lives inside a conditional branch that a valid request can legitimately
/// skip, and (2) a handler that forgets to commit at all. Both are covered by
/// CommandHandlerUnitOfWorkDecorator (see its doc comment in
/// Application.Abstractions.Messaging) - this file proves the fix end to end
/// against real PostgreSQL.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class CommitOnSuccessRegressionTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public CommitOnSuccessRegressionTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    // ─── Class 1: commit only on a conditional branch ────────────────────

    [Fact]
    public async Task AddTextureToTextureSet_ForAFileWithNoBatchUploadRecord_PersistsTheTexture()
    {
        // Arrange: exactly the merge/split-channel flow's precondition. Before
        // the fix, AddTextureToTextureSetCommandHandler's ONLY
        // IUnitOfWork.SaveChangesAsync call lived inside
        // `if (batchUpload != null)` - a file added via the merge dialog
        // (POST /texture-sets/{id}/textures, e.g. splitting an ORM map's R/G/B
        // channels into AO/Roughness/Metallic textures) legitimately has no
        // BatchUpload row for its FileId, so that branch is never taken and
        // the staged texture never persisted. This is the exact CI failure:
        // "Merge ORM packed texture using Split Channels" - "ORM Target
        // should have AO, Roughness, and Metallic textures" but the set
        // stayed empty.
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var textureSetRepository = scope.ServiceProvider.GetRequiredService<ITextureSetRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var textureSet = await textureSetRepository.AddAsync(
            TextureSet.Create($"merge-target-{Guid.NewGuid():N}", DateTime.UtcNow, TextureSetKind.ModelSpecific));

        var file = Domain.Models.File.Create(
            "texture_orm.png",
            $"stored-{Guid.NewGuid():N}.png",
            $"ab/cd/{Guid.NewGuid():N}.png",
            "image/png",
            FileType.Texture,
            1024L,
            Guid.NewGuid().ToString("N").PadRight(64, '0'),
            DateTime.UtcNow);
        context.Files.Add(file);

        // One seed commit for both - no BatchUpload row is ever created for
        // `file`, matching the "no batchId" precondition.
        await unitOfWork.SaveChangesAsync();

        var handler = scope.ServiceProvider
            .GetRequiredService<ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse>>();

        // Act
        var result = await handler.Handle(
            new AddTextureToTextureSetCommand(textureSet.Id, file.Id, TextureType.AO, TextureChannel.R),
            CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess, result.IsFailure ? $"{result.Error.Code}: {result.Error.Message}" : string.Empty);
        Assert.True(result.Value.TextureId > 0, "TextureId should be a real, database-assigned id.");

        // Verify durability through a fresh scope/DbContext.
        using var verifyScope = _factory.Services.CreateScope();
        var verifyRepository = verifyScope.ServiceProvider.GetRequiredService<ITextureSetRepository>();
        var persisted = await verifyRepository.GetByIdAsync(textureSet.Id);

        Assert.NotNull(persisted);
        var texture = Assert.Single(persisted!.Textures);
        Assert.Equal(TextureType.AO, texture.TextureType);
        Assert.Equal(TextureChannel.R, texture.SourceChannel);
    }

    // ─── Class 2: no explicit commit at all ───────────────────────────────

    [Fact]
    public async Task Decorator_CommitsOnBehalfOfAHandlerThatNeverCallsUnitOfWork()
    {
        // Arrange: a handler shaped exactly like the pre-fix
        // HardDeleteTextureSetCommandHandler (one of the six handlers this PR
        // fixed for having no commit at all) - it stages the delete via the
        // repository but never calls IUnitOfWork itself. Constructed directly
        // and wrapped by CommandHandlerUnitOfWorkDecorator by hand (the
        // decorator path, bypassing DI resolution) to prove the wrapper -
        // not the handler - is what makes the delete durable.
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();

        var textureSetRepository = scope.ServiceProvider.GetRequiredService<ITextureSetRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var textureSet = await textureSetRepository.AddAsync(
            TextureSet.Create($"decorator-safety-net-{Guid.NewGuid():N}", DateTime.UtcNow, TextureSetKind.ModelSpecific));
        await unitOfWork.SaveChangesAsync();

        var noCommitHandler = new NoCommitHardDeleteTextureSetCommandHandler(textureSetRepository);
        var decorated = new CommandHandlerUnitOfWorkDecorator<HardDeleteTextureSetCommand, HardDeleteTextureSetResponse>(
            noCommitHandler, unitOfWork);

        // Act
        var result = await decorated.Handle(new HardDeleteTextureSetCommand(textureSet.Id), CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess, result.IsFailure ? $"{result.Error.Code}: {result.Error.Message}" : string.Empty);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyRepository = verifyScope.ServiceProvider.GetRequiredService<ITextureSetRepository>();
        var persisted = await verifyRepository.GetByIdAsync(textureSet.Id);

        Assert.Null(persisted);
    }

    /// <summary>
    /// Deliberately mirrors the ORIGINAL (pre-fix) HardDeleteTextureSetCommandHandler:
    /// stages the delete via the repository and returns Success, with no
    /// IUnitOfWork.SaveChangesAsync call anywhere in this class. Only the
    /// decorator wrapped around it in the test above is responsible for
    /// making the delete durable.
    /// </summary>
    private sealed class NoCommitHardDeleteTextureSetCommandHandler : ICommandHandler<HardDeleteTextureSetCommand, HardDeleteTextureSetResponse>
    {
        private readonly ITextureSetRepository _textureSetRepository;

        public NoCommitHardDeleteTextureSetCommandHandler(ITextureSetRepository textureSetRepository)
        {
            _textureSetRepository = textureSetRepository;
        }

        public async Task<Result<HardDeleteTextureSetResponse>> Handle(HardDeleteTextureSetCommand request, CancellationToken cancellationToken)
        {
            var textureSet = await _textureSetRepository.GetByIdAsync(request.TextureSetId, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<HardDeleteTextureSetResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {request.TextureSetId} not found."));
            }

            await _textureSetRepository.HardDeleteAsync(request.TextureSetId, cancellationToken);

            // No unitOfWork.SaveChangesAsync() call - that's the point.
            return Result.Success(new HardDeleteTextureSetResponse(true, "Texture set deleted successfully"));
        }
    }
}
