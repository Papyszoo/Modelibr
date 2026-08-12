using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Models;
using Application.RecycledFiles;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Application.Tests.Models;

/// <summary>
/// Search reads the projection and nothing else, so every state transition it cares
/// about has to be mirrored into <c>AssetSearchDocuments</c>. These are the transitions
/// that were not: an asset stayed searchable after being recycled, and the current
/// version marker never moved when the active version did.
/// </summary>
public class SearchProjectionLifecycleTests
{
    private static readonly DateTime Now = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocs = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly Mock<IDateTimeProvider> _clock = new();

    public SearchProjectionLifecycleTests()
    {
        _clock.Setup(c => c.UtcNow).Returns(Now);
    }

    [Fact]
    public async Task SoftDeletingAModel_HidesItsSearchDocuments()
    {
        // Regression: a recycled model kept every document, so search (and the MCP
        // read tools an agent drives) went on returning an asset the user deleted.
        var model = Model.Create("Sword", Now).WithId(5);
        _models.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        var queue = new Mock<IThumbnailQueue>();
        queue.Setup(q => q.CancelActiveJobsForModelAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync(0);

        var handler = new SoftDeleteModelCommandHandler(
            _models.Object, _searchDocs.Object, _clock.Object, queue.Object,
            NullLogger<SoftDeleteModelCommandHandler>.Instance, _uow.Object);

        var result = await handler.Handle(new SoftDeleteModelCommand(5), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocs.Verify(
            r => r.SetActiveForAssetAsync("Model", 5, false, It.IsAny<CancellationToken>()),
            Times.Once);
        _uow.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RestoringAModel_BringsItBackIntoSearchImmediately()
    {
        var model = Model.Create("Sword", Now).WithId(5);
        model.SoftDelete(Now);
        _models.Setup(r => r.GetDeletedByIdAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync(model);

        var handler = BuildRestoreHandler();
        var result = await handler.Handle(new RestoreEntityCommand("model", 5), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocs.Verify(
            r => r.SetActiveForAssetAsync("Model", 5, true, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ChangingTheActiveVersion_MovesTheCurrentVersionMarker()
    {
        // Regression: "current" was whatever finished extracting last. Switching the
        // active version in the UI left search answering from the previous one, with
        // nothing to correct it short of a re-derive.
        var model = Model.Create("Sword", Now).WithId(5);
        var version = ModelVersion.Create(5, 2, "v2", Now).WithId(9);
        _models.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _versions.Setup(r => r.GetByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync(version);
        // SetActiveVersion validates against the loaded collection.
        model.Versions.Add(version);

        var handler = new SetActiveVersionCommandHandler(
            _models.Object, _versions.Object, _searchDocs.Object, _clock.Object, _uow.Object);

        var result = await handler.Handle(new SetActiveVersionCommand(5, 9), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocs.Verify(
            r => r.SetCurrentVersionAsync("Model", 5, 9, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    private RestoreEntityCommandHandler BuildRestoreHandler() => new(
        _models.Object,
        _versions.Object,
        new Mock<IFileRepository>().Object,
        new Mock<ITextureSetRepository>().Object,
        new Mock<ISpriteRepository>().Object,
        new Mock<ISoundRepository>().Object,
        new Mock<IScriptRepository>().Object,
        new Mock<IEnvironmentMapRepository>().Object,
        _searchDocs.Object,
        _clock.Object,
        _uow.Object);
}
