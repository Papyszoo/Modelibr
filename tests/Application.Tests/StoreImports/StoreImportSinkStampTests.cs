using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Metadata;
using Application.StoreImports;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.StoreImports;

/// <summary>
/// The store importer stamps rights and provenance through the real
/// <see cref="StoreImportSink"/> and the real metadata handlers. These are the tests that
/// would have caught 330 store models importing with no <c>AssetMetadata</c> row at all.
/// </summary>
public class StoreImportSinkStampTests
{
    private const string Family = "Model";
    private const int AssetId = 7331;
    private static readonly DateTime ImportedAt = new(2026, 10, 5, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task Stamp_WhenNoMetadataRowExists_CreatesOne()
    {
        var h = new Harness();

        await h.Stamp();

        Assert.NotNull(h.Stored);
        Assert.Equal(Family, h.Stored!.AssetType);
        Assert.Equal(AssetId, h.Stored.AssetId);
        Assert.Equal("CC-BY", h.Stored.License);
        Assert.Equal("Kenney", h.Stored.Author);
        Assert.Equal("Store Import", h.Stored.SourceKind);
        Assert.Equal("https://store.example", h.Stored.StoreUrl);
        Assert.Equal("asset-1", h.Stored.StoreAssetId);
        h.Repository.Verify(
            r => r.AddAsync(It.IsAny<Domain.Models.AssetMetadata>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Stamp_WhenTheWriteIsRefused_SurfacesTheFailure()
    {
        // The old sink dropped the handler's Result on the floor, so a patch the schema
        // refused looked exactly like a successful stamp. The processor's best-effort wrapper
        // catches the exception and logs it - which is the difference between a silent hole
        // and a warning.
        var read = new Mock<IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse>>();
        read.Setup(r => r.Handle(It.IsAny<ReadAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(
                new Error("ReadOnlyMetadataField", "no")));
        var set = new Mock<ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse>>();
        set.Setup(s => s.Handle(It.IsAny<SetAssetMetadataCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<AssetMetadataResponse>(
                new Error("ReadOnlyMetadataField", "a read-only field was in the patch")));

        var sink = BuildSink(read.Object, set.Object);

        await Assert.ThrowsAsync<StoreImportException>(
            () => sink.StampAssetMetadataAsync(Family, AssetId, Stamp(), CancellationToken.None));
    }

    private static StoreAssetMetadataStamp Stamp()
        => new(
            License: "CC-BY",
            LicenseName: "CC BY 4.0",
            Author: "Kenney",
            CreditName: "Kenney.nl",
            CreditUrl: "https://kenney.nl",
            AttributionRequired: true,
            SourceUrl: "https://store.example/assets/asset-1",
            StoreUrl: "https://store.example",
            StoreAssetId: "asset-1",
            StoreItemId: "item-1",
            ImportedAt: ImportedAt);

    // Only the two metadata handlers are exercised by the stamp; the sink's other 27
    // collaborators are never touched on this path, so they stay unset.
    private static StoreImportSink BuildSink(
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> read,
        ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse> set)
        => new(
            null!, null!, null!, null!, null!, null!, null!, null!, null!, null!,
            null!, null!, null!, null!, null!, null!, null!, null!, null!, null!,
            null!, null!, null!, null!, null!, null!, null!,
            read,
            set);

    private sealed class Harness
    {
        public readonly Mock<IAssetEntityMetadata> Entity = new();
        public readonly Mock<IAssetMetadataRepository> Repository = new();
        public readonly Mock<IAssetSearchDocumentRepository> SearchDocuments = new();
        public readonly Mock<IUnitOfWork> UnitOfWork = new();

        public Domain.Models.AssetMetadata? Stored { get; private set; }

        private readonly StoreImportSink _sink;

        public Harness()
        {
            Entity
                .Setup(e => e.ReadAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success(new AssetEntityMetadataState(
                    "Arrow", null, Array.Empty<string>(), null, null)));
            Entity
                .Setup(e => e.ValidateWriteAsync(
                    It.IsAny<string>(), It.IsAny<int>(),
                    It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success());
            Entity
                .Setup(e => e.WriteAsync(
                    It.IsAny<string>(), It.IsAny<int>(),
                    It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success());

            Repository
                .Setup(r => r.GetAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(() => Stored);
            Repository
                .Setup(r => r.AddAsync(It.IsAny<Domain.Models.AssetMetadata>(), It.IsAny<CancellationToken>()))
                .Callback<Domain.Models.AssetMetadata, CancellationToken>((m, _) => Stored = m)
                .Returns(Task.CompletedTask);
            Repository
                .Setup(r => r.UpdateAsync(It.IsAny<Domain.Models.AssetMetadata>(), It.IsAny<CancellationToken>()))
                .Callback<Domain.Models.AssetMetadata, CancellationToken>((m, _) => Stored = m)
                .Returns(Task.CompletedTask);

            UnitOfWork
                .Setup(u => u.InTransactionAsync(
                    It.IsAny<Func<CancellationToken, Task<Result<AssetMetadataResponse>>>>(),
                    It.IsAny<CancellationToken>()))
                .Returns<Func<CancellationToken, Task<Result<AssetMetadataResponse>>>, CancellationToken>(
                    (work, token) => work(token));

            var clock = new Mock<IDateTimeProvider>();
            clock.SetupGet(c => c.UtcNow).Returns(ImportedAt);

            var read = new ReadAssetMetadataQueryHandler(
                Entity.Object, Repository.Object, SearchDocuments.Object);
            var set = new SetAssetMetadataCommandHandler(
                Entity.Object, Repository.Object, SearchDocuments.Object, read, clock.Object, UnitOfWork.Object);

            _sink = BuildSink(read, set);
        }

        public Task Stamp()
            => _sink.StampAssetMetadataAsync(Family, AssetId, StoreImportSinkStampTests.Stamp(), CancellationToken.None);
    }
}
