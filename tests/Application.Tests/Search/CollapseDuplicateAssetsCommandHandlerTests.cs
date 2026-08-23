using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Application.Search;
using Domain.Models;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Search;

public class CollapseDuplicateAssetsCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 8, 24, 0, 0, 0, DateTimeKind.Utc);
    private const string Fingerprint = "abc123";

    private readonly Mock<IAssetSearchDocumentRepository> _searchDocuments = new();
    private readonly Mock<ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse>> _softDelete = new();
    private readonly CollapseDuplicateAssetsCommandHandler _handler;

    public CollapseDuplicateAssetsCommandHandlerTests()
    {
        _softDelete.Setup(h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new SoftDeleteModelResponse(true, "ok")));
        _handler = new CollapseDuplicateAssetsCommandHandler(_searchDocuments.Object, _softDelete.Object);
    }

    private void Fingerprinted(int modelId, string? geometryKey)
    {
        var doc = AssetSearchDocument.Create(
            assetType: "Model", assetId: modelId, versionId: modelId, partPath: null,
            isCurrentVersion: true, prominence: "full", displayName: $"Model {modelId}",
            tokens: "model", browseSummary: "", updatedAt: Now, geometryKey: geometryKey);
        _searchDocuments
            .Setup(r => r.GetCurrentAssetDocumentAsync("Model", modelId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(doc);
    }

    [Fact]
    public async Task Handle_Recycles_The_Copies_And_Keeps_The_Survivor()
    {
        Fingerprinted(1, Fingerprint);
        Fingerprinted(2, Fingerprint);

        var result = await _handler.Handle(
            new CollapseDuplicateAssetsCommand(1, new[] { 2 }), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new[] { 2 }, result.Value.Recycled);
        _softDelete.Verify(
            h => h.Handle(It.Is<SoftDeleteModelCommand>(c => c.ModelId == 2), It.IsAny<CancellationToken>()),
            Times.Once);
        _softDelete.Verify(
            h => h.Handle(It.Is<SoftDeleteModelCommand>(c => c.ModelId == 1), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_Refuses_An_Id_That_Is_Not_Actually_A_Copy()
    {
        // The caller's list came from a page that may be minutes old. Recycling on a stale
        // listing would delete a different asset.
        Fingerprinted(1, Fingerprint);
        Fingerprinted(2, "a-different-shape");

        var result = await _handler.Handle(
            new CollapseDuplicateAssetsCommand(1, new[] { 2 }), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("NotADuplicate", result.Error.Code);
        _softDelete.Verify(
            h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_Refuses_When_The_Survivor_Has_No_Fingerprint()
    {
        // Nothing can be shown to be a copy of an asset that was never hashed, and a shared
        // "no fingerprint" would make every unhashed asset a duplicate of every other.
        Fingerprinted(1, null);

        var result = await _handler.Handle(
            new CollapseDuplicateAssetsCommand(1, new[] { 2 }), CancellationToken.None);

        Assert.Equal("SurvivorNotFingerprinted", result.Error.Code);
    }

    [Fact]
    public async Task Handle_DryRun_Verifies_But_Changes_Nothing()
    {
        Fingerprinted(1, Fingerprint);
        Fingerprinted(2, Fingerprint);

        var result = await _handler.Handle(
            new CollapseDuplicateAssetsCommand(1, new[] { 2 }, DryRun: true), CancellationToken.None);

        Assert.True(result.Value.DryRun);
        Assert.Equal(new[] { 2 }, result.Value.Recycled);
        _softDelete.Verify(
            h => h.Handle(It.IsAny<SoftDeleteModelCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_Refuses_When_The_Only_Id_Given_Is_The_Survivor()
    {
        var result = await _handler.Handle(
            new CollapseDuplicateAssetsCommand(1, new[] { 1 }), CancellationToken.None);

        Assert.Equal("NothingToCollapse", result.Error.Code);
    }
}
