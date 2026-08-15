using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Packs;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Packs;

/// <summary>
/// The two pack mutations that invalidate the denormalised pack names on the search
/// projection without any model changing hands: a rename leaves every member matching the
/// old name and none matching the new one, and a delete drops the join rows but leaves the
/// name behind so search keeps matching a pack that no longer exists.
///
/// Both go through the bulk projection call rather than a per-model loop - they touch the
/// entire membership, and a real content pack runs to four figures.
/// </summary>
public class PackProjectionMirroringTests
{
    private readonly Mock<IPackRepository> _packRepository = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocumentRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    private readonly DateTime _now = DateTime.UtcNow;

    private UpdatePackCommandHandler CreateUpdateHandler() => new(
        _packRepository.Object,
        _searchDocumentRepository.Object,
        _dateTimeProvider.Object,
        _unitOfWork.Object);

    private DeletePackCommandHandler CreateDeleteHandler() => new(
        _packRepository.Object,
        _searchDocumentRepository.Object,
        _unitOfWork.Object);

    private Pack PackWithMembers(string name, params int[] modelIds)
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(_now);
        var pack = Pack.Create(name, null, null, null, _now).WithId(6);
        foreach (var id in modelIds)
        {
            pack.AddModel(Model.Create($"Model {id}", _now).WithId(id), _now);
        }

        _packRepository.Setup(x => x.GetByIdAsync(pack.Id, It.IsAny<CancellationToken>())).ReturnsAsync(pack);
        return pack;
    }

    [Fact]
    public async Task Handle_WhenPackIsRenamed_ReplacesTheOldNameOnEveryMemberInOneCall()
    {
        var pack = PackWithMembers("base meshes", 1, 2);
        _packRepository.Setup(x => x.GetByNameAsync("CC0 Models", It.IsAny<CancellationToken>()))
            .ReturnsAsync((Pack?)null);
        // Model 2 also belongs to another pack, which the rename must leave alone.
        _packRepository.Setup(x => x.GetNamesByModelIdsAsync(It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<int, IReadOnlyList<string>>
            {
                [1] = ["base meshes"],
                [2] = ["base meshes", "POLYGON City"],
            });

        IReadOnlyDictionary<int, IReadOnlyList<string>>? captured = null;
        _searchDocumentRepository
            .Setup(x => x.SetPacksForAssetsAsync(
                "Model", It.IsAny<IReadOnlyDictionary<int, IReadOnlyList<string>>>(), It.IsAny<CancellationToken>()))
            .Callback<string, IReadOnlyDictionary<int, IReadOnlyList<string>>, CancellationToken>(
                (_, map, _) => captured = map)
            .Returns(Task.CompletedTask);

        var result = await CreateUpdateHandler().Handle(
            new UpdatePackCommand(pack.Id, "CC0 Models", null, null, null), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(captured);
        Assert.Equal(["CC0 Models"], captured![1]);
        Assert.Equal(["POLYGON City", "CC0 Models"], captured[2]);

        // One bulk call, not one per member.
        _searchDocumentRepository.Verify(x => x.SetPacksForAssetsAsync(
            It.IsAny<string>(), It.IsAny<IReadOnlyDictionary<int, IReadOnlyList<string>>>(),
            It.IsAny<CancellationToken>()), Times.Once);
        _searchDocumentRepository.Verify(x => x.SetPacksForAssetAsync(
            It.IsAny<string>(), It.IsAny<int>(), It.IsAny<IEnumerable<string>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenPackIsUpdatedWithoutRenaming_DoesNotTouchTheProjection()
    {
        // Description-only edits leave every member's pack names correct, so rewriting
        // thousands of projection rows would be pure churn.
        var pack = PackWithMembers("POLYGON City", 1, 2);

        var result = await CreateUpdateHandler().Handle(
            new UpdatePackCommand(pack.Id, "POLYGON City", "new description", null, null),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocumentRepository.Verify(x => x.SetPacksForAssetsAsync(
            It.IsAny<string>(), It.IsAny<IReadOnlyDictionary<int, IReadOnlyList<string>>>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenPackIsDeleted_DropsItsNameFromEveryMemberButKeepsTheirOtherPacks()
    {
        var pack = PackWithMembers("Scratch", 1, 2);
        _packRepository.Setup(x => x.GetNamesByModelIdsAsync(It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<int, IReadOnlyList<string>>
            {
                [1] = ["Scratch"],
                [2] = ["Scratch", "POLYGON City"],
            });

        IReadOnlyDictionary<int, IReadOnlyList<string>>? captured = null;
        _searchDocumentRepository
            .Setup(x => x.SetPacksForAssetsAsync(
                "Model", It.IsAny<IReadOnlyDictionary<int, IReadOnlyList<string>>>(), It.IsAny<CancellationToken>()))
            .Callback<string, IReadOnlyDictionary<int, IReadOnlyList<string>>, CancellationToken>(
                (_, map, _) => captured = map)
            .Returns(Task.CompletedTask);

        var result = await CreateDeleteHandler().Handle(
            new DeletePackCommand(pack.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(captured);
        // Emptied, not skipped: model 1 must stop matching "Scratch" entirely.
        Assert.Empty(captured![1]);
        Assert.Equal(["POLYGON City"], captured[2]);

        // The projection is patched BEFORE the pack row goes away, since the recompute
        // reads the still-present membership.
        _packRepository.Verify(x => x.DeleteAsync(pack, It.IsAny<CancellationToken>()), Times.Once);
    }
}
