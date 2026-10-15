using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.RecycledFiles;
using Application.Settings;
using Domain.Models;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using WebApi.Infrastructure;
using Xunit;

namespace WebApi.Tests.Infrastructure;

/// <summary>
/// Covers the recycled-file purge: the "Never" default must do nothing, only
/// items older than the retention are dispatched, and every deletion goes
/// through the same command the manual "delete forever" uses. The purge logic
/// is exercised directly with an explicit "now", not through the 24h timer.
/// </summary>
public class RecycledFilePurgeServiceTests
{
    private static readonly DateTime Now = new(2026, 7, 10, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<ISettingRepository> _settingRepository = new();
    private readonly Mock<IQueryHandler<GetAllRecycledQuery, GetAllRecycledQueryResponse>> _recycledQuery = new();
    private readonly Mock<ICommandHandler<PermanentDeleteEntityCommand, PermanentDeleteEntityResponse>> _permanentDelete = new();
    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly RecycledFilePurgeService _purge;

    public RecycledFilePurgeServiceTests()
    {
        _permanentDelete
            .Setup(h => h.Handle(It.IsAny<PermanentDeleteEntityCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new PermanentDeleteEntityResponse(true, "deleted", [])));
        _fileRepository
            .Setup(r => r.IsFileHashReferencedByOthersAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        _purge = new RecycledFilePurgeService(
            _settingRepository.Object,
            _recycledQuery.Object,
            _permanentDelete.Object,
            _fileRepository.Object,
            NullLogger<RecycledFilePurgeService>.Instance);
    }

    private void StoreRetention(string? value)
    {
        _settingRepository
            .Setup(r => r.GetByKeyAsync(SettingKeys.CleanRecycledFilesAfterDays, It.IsAny<CancellationToken>()))
            .ReturnsAsync(value is null ? null : Setting.Create(SettingKeys.CleanRecycledFilesAfterDays, value, Now));
    }

    private void ListRecycled(GetAllRecycledQueryResponse response)
    {
        _recycledQuery
            .Setup(h => h.Handle(It.IsAny<GetAllRecycledQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(response));
    }

    private static GetAllRecycledQueryResponse EmptyList() => new(
        [], [], [], [], [], [], [], [], [], [], []);

    [Fact]
    public async Task PurgeAsync_WhenRetentionAbsent_DoesNothing()
    {
        StoreRetention(null);

        var purged = await _purge.PurgeAsync(Now);

        Assert.Equal(0, purged);
        _recycledQuery.Verify(
            h => h.Handle(It.IsAny<GetAllRecycledQuery>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _permanentDelete.Verify(
            h => h.Handle(It.IsAny<PermanentDeleteEntityCommand>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task PurgeAsync_WhenRetentionZero_DoesNothing()
    {
        StoreRetention("0");

        var purged = await _purge.PurgeAsync(Now);

        Assert.Equal(0, purged);
        _permanentDelete.Verify(
            h => h.Handle(It.IsAny<PermanentDeleteEntityCommand>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task PurgeAsync_WhenRetentionSet_PurgesOnlyItemsOlderThanCutoff()
    {
        StoreRetention("30");
        var old = Now.AddDays(-40);
        var recent = Now.AddDays(-10);

        ListRecycled(EmptyList() with
        {
            Models =
            [
                new RecycledModelDto(1, "Old model", old, 1),
                new RecycledModelDto(2, "Recent model", recent, 1),
            ],
            TextureSets = [new RecycledTextureSetDto(3, "Old set", old, 1, null)],
            Materials = [new RecycledMaterialDto(4, "Recent material", recent, null)],
        });

        var purged = await _purge.PurgeAsync(Now);

        Assert.Equal(2, purged);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "model" && c.EntityId == 1), It.IsAny<CancellationToken>()),
            Times.Once);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "model" && c.EntityId == 2), It.IsAny<CancellationToken>()),
            Times.Never);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "textureset" && c.EntityId == 3), It.IsAny<CancellationToken>()),
            Times.Once);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "material" && c.EntityId == 4), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task PurgeAsync_SkipsChildrenOfAnEligibleParentAndReferencedFiles()
    {
        StoreRetention("30");
        var old = Now.AddDays(-40);

        ListRecycled(EmptyList() with
        {
            Models = [new RecycledModelDto(1, "Old model", old, 2)],
            ModelVersions =
            [
                // Its model is being purged, so the model's purge removes it.
                new RecycledModelVersionDto(10, 1, 1, null, old, 1),
                // Its model is live, so the version is purged on its own.
                new RecycledModelVersionDto(11, 2, 1, null, old, 1),
            ],
            EnvironmentMaps = [new RecycledEnvironmentMapDto(5, "Old envmap", old, 1, null)],
            EnvironmentMapVariants =
            [
                new RecycledEnvironmentMapVariantDto(50, 5, "Old envmap", null, "2k", old),
                new RecycledEnvironmentMapVariantDto(51, 6, "Live envmap", null, "2k", old),
            ],
            Files =
            [
                new RecycledFileDto(20, "still-used.bin", "files/aa/still-used.bin", 10, old),
                new RecycledFileDto(21, "orphan.bin", "files/bb/orphan.bin", 10, old),
            ],
        });

        _fileRepository
            .Setup(r => r.IsFileHashReferencedByOthersAsync(20, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var purged = await _purge.PurgeAsync(Now);

        // model 1 + version 11 + envmap 5 + variant 51 + file 21
        Assert.Equal(5, purged);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "modelversion" && c.EntityId == 10), It.IsAny<CancellationToken>()),
            Times.Never);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "modelversion" && c.EntityId == 11), It.IsAny<CancellationToken>()),
            Times.Once);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "environmentmapvariant" && c.EntityId == 50), It.IsAny<CancellationToken>()),
            Times.Never);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "environmentmapvariant" && c.EntityId == 51), It.IsAny<CancellationToken>()),
            Times.Once);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "file" && c.EntityId == 20), It.IsAny<CancellationToken>()),
            Times.Never);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "file" && c.EntityId == 21), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task PurgeAsync_WhenOneItemFails_ContinuesWithTheRest()
    {
        StoreRetention("30");
        var old = Now.AddDays(-40);

        ListRecycled(EmptyList() with
        {
            Models = [new RecycledModelDto(1, "Old model", old, 1)],
            Sprites = [new RecycledSpriteDto(7, "Old sprite", 30, old)],
        });

        _permanentDelete
            .Setup(h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityId == 1), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("disk went away"));

        var purged = await _purge.PurgeAsync(Now);

        Assert.Equal(1, purged);
        _permanentDelete.Verify(
            h => h.Handle(It.Is<PermanentDeleteEntityCommand>(c => c.EntityType == "sprite" && c.EntityId == 7), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task PurgeAsync_WhenListFails_ReturnsZero()
    {
        StoreRetention("30");
        _recycledQuery
            .Setup(h => h.Handle(It.IsAny<GetAllRecycledQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<GetAllRecycledQueryResponse>(new Error("ListFailed", "boom")));

        var purged = await _purge.PurgeAsync(Now);

        Assert.Equal(0, purged);
    }
}
