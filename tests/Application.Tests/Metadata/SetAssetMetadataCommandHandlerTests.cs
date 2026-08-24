using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Metadata;
using Domain.Models;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Metadata;

public class SetAssetMetadataCommandHandlerTests
{
    private const string Family = "Model";
    private const int AssetId = 42;

    [Fact]
    public async Task OmittedField_IsLeftAlone()
    {
        var fixture = new Fixture();
        fixture.Stored.SetRights("CC-BY", "CC BY 4.0", null, "Kenney", null, null, true, DateTime.UtcNow);

        await fixture.Handle(new { author = "Someone Else" });

        Assert.Equal("CC-BY", fixture.Stored.License);
        Assert.Equal("Someone Else", fixture.Stored.Author);
    }

    /// <summary>
    /// The distinction the whole field-bag payload exists for: a population pass that has
    /// learned a licence must be able to leave a description alone, and a person clearing a
    /// wrong credit must be able to actually clear it.
    /// </summary>
    [Fact]
    public async Task ExplicitNull_ClearsTheField()
    {
        var fixture = new Fixture();
        fixture.Stored.SetRights(null, null, null, "Kenney", null, null, null, DateTime.UtcNow);

        await fixture.Handle("{\"author\": null}");

        Assert.Null(fixture.Stored.Author);
    }

    [Fact]
    public async Task EnumValue_IsNormalizedToTheSchemaSpelling()
    {
        var fixture = new Fixture();

        await fixture.Handle(new { styles = new[] { "low poly", "VOXEL" } });

        Assert.Equal(new[] { "Low Poly", "Voxel" }, fixture.Stored.Styles);
    }

    [Fact]
    public async Task EnumValue_OutsideTheVocabulary_IsRefused()
    {
        var fixture = new Fixture();

        var result = await fixture.Handle(new { styles = new[] { "lowpoly" } });

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidMetadataValue", result.Error.Code);
        // Refused, not silently dropped: a facet that quietly accepts near-misses stops
        // being filterable, which is the only reason it is typed.
        Assert.Empty(fixture.Stored.Styles);
    }

    /// <summary>
    /// Search reads projection state only, so a style that does not reach the projection is
    /// a style nothing can be found by. Setting one and being unable to filter for it is the
    /// failure this guards.
    /// </summary>
    [Fact]
    public async Task SettingAFacet_ReachesSearchInTheSameWrite()
    {
        var fixture = new Fixture();

        await fixture.Handle(new { styles = new[] { "Low Poly" }, license = "CC0" });

        fixture.SearchDocuments.Verify(r => r.SetSchemaFacetsForAssetAsync(
            Family,
            AssetId,
            It.Is<IEnumerable<string>>(v => v.Contains("Low Poly")),
            It.IsAny<IEnumerable<string>>(),
            "CC0",
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UnknownField_IsRefusedAndNamesTheSchema()
    {
        var fixture = new Fixture();

        var result = await fixture.Handle(new { licence = "CC0" });

        Assert.True(result.IsFailure);
        Assert.Equal("UnknownMetadataField", result.Error.Code);
        Assert.Contains("get_metadata_schema", result.Error.Message);
    }

    [Fact]
    public async Task DerivedField_CannotBeWritten()
    {
        var fixture = new Fixture();

        var result = await fixture.Handle(new { triangleCount = 900 });

        Assert.True(result.IsFailure);
        Assert.Equal("ReadOnlyMetadataField", result.Error.Code);
    }

    [Fact]
    public async Task EntityStoredField_GoesThroughTheFamilysOwnCommand()
    {
        var fixture = new Fixture();

        await fixture.Handle(new { tags = new[] { "chair", "oak" } });

        fixture.Entity.Verify(e => e.WriteAsync(
            Family,
            AssetId,
            It.Is<AssetEntityMetadataWrite>(w => w.SetTags && w.Tags!.Count == 2 && !w.SetDescription),
            It.IsAny<CancellationToken>()), Times.Once);

        // A tag write must not create a side-table row - the tags for this family do not
        // live there, and an empty row would report a schema version nothing wrote.
        fixture.Repository.Verify(
            r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task FirstWrite_CreatesTheRowStampedWithTheSchemaVersion()
    {
        var fixture = new Fixture(existingRow: false);

        await fixture.Handle(new { license = "CC0" });

        fixture.Repository.Verify(
            r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(AssetMetadataSchema.Version, fixture.Added!.SchemaVersion);
        Assert.Equal("CC0", fixture.Added.License);
    }

    [Fact]
    public async Task MissingAsset_FailsBeforeAnythingIsWritten()
    {
        var fixture = new Fixture();
        fixture.Entity
            .Setup(e => e.ReadAsync(Family, AssetId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<AssetEntityMetadataState>(new Error("AssetNotFound", "no")));

        var result = await fixture.Handle(new { license = "CC0" });

        Assert.True(result.IsFailure);
        Assert.Equal("AssetNotFound", result.Error.Code);
        fixture.Repository.Verify(
            r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// The half-applied patch this closes: four of the six families spend two commands and
    /// two commits on one entity write, so a category the second command rejects used to
    /// return a failure with the tags from the first already durable.
    /// </summary>
    [Fact]
    public async Task RejectedCategory_WritesNothingAtAll()
    {
        var fixture = new Fixture();
        fixture.Entity
            .Setup(e => e.ValidateWriteAsync(
                Family, It.IsAny<int>(),
                It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(new Error("CategoryNotFound", "no such category")));

        var result = await fixture.Handle(new { category = 4321, license = "CC0" });

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryNotFound", result.Error.Code);
        fixture.Entity.Verify(
            e => e.WriteAsync(
                It.IsAny<string>(), It.IsAny<int>(),
                It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()),
            Times.Never);
        fixture.Repository.Verify(
            r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()), Times.Never);
        fixture.UnitOfWork.Verify(
            u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    /// <summary>
    /// The same guarantee for the OTHER thing prevalidation now refuses: a category that
    /// exists but belongs to the wrong <c>TextureSetKind</c>. That one used to pass the
    /// existence check and be rejected by the family's command, one commit too late.
    /// </summary>
    [Fact]
    public async Task RejectedCategoryKind_WritesNothingAtAll()
    {
        var fixture = new Fixture();
        fixture.Entity
            .Setup(e => e.ValidateWriteAsync(
                Family, It.IsAny<int>(),
                It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(new Error("CategoryKindMismatch", "wrong vocabulary")));

        var result = await fixture.Handle(new { category = 4321, tags = new[] { "wood" }, license = "CC0" });

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryKindMismatch", result.Error.Code);

        // Every field of the patch, not just the category: the tags and the schema-side
        // values travel on separate commits, and a rejected patch may leave none of them.
        fixture.Entity.Verify(
            e => e.WriteAsync(
                It.IsAny<string>(), It.IsAny<int>(),
                It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()),
            Times.Never);
        fixture.Repository.Verify(
            r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()), Times.Never);
        fixture.UnitOfWork.Verify(
            u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        Assert.Null(fixture.Stored.License);
        Assert.Empty(fixture.Stored.Tags);
    }

    /// <summary>
    /// Prevalidation runs before the schema-side values are staged too, not only before the
    /// entity write - otherwise a rejected patch would still have mutated the stored
    /// <c>AssetMetadata</c> row in memory, and the next SaveChanges in the same scope would
    /// have committed it.
    /// </summary>
    [Fact]
    public async Task RejectedPatch_LeavesTheStoredSchemaRowUntouched()
    {
        var fixture = new Fixture();
        var before = fixture.Stored.UpdatedAt;
        fixture.Entity
            .Setup(e => e.ValidateWriteAsync(
                Family, It.IsAny<int>(),
                It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure(new Error("CategoryNotFound", "no such category")));

        var result = await fixture.Handle(new { category = 4321, license = "CC0", description = "new" });

        Assert.True(result.IsFailure);
        Assert.Null(fixture.Stored.License);
        Assert.Null(fixture.Stored.Description);
        Assert.Equal(before, fixture.Stored.UpdatedAt);
        fixture.Repository.Verify(
            r => r.UpdateAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UnknownFamily_IsRefused()
    {
        var fixture = new Fixture();

        var result = await fixture.Handle(new { license = "CC0" }, family: "Models");

        Assert.True(result.IsFailure);
        Assert.Equal("UnknownAssetFamily", result.Error.Code);
    }

    private sealed class Fixture
    {
        public readonly Mock<IAssetEntityMetadata> Entity = new();
        public readonly Mock<IAssetMetadataRepository> Repository = new();
        public readonly Mock<IAssetSearchDocumentRepository> SearchDocuments = new();
        public readonly Mock<IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse>> Read = new();
        public readonly Mock<IUnitOfWork> UnitOfWork = new();

        public AssetMetadata Stored { get; }
        public AssetMetadata? Added { get; private set; }

        private readonly SetAssetMetadataCommandHandler _handler;

        public Fixture(bool existingRow = true)
        {
            Stored = AssetMetadata.Create(Family, AssetId, AssetMetadataSchema.Version, DateTime.UtcNow);

            Entity
                .Setup(e => e.ReadAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success(new AssetEntityMetadataState(
                    "Chair", null, Array.Empty<string>(), null, null)));
            Entity
                .Setup(e => e.WriteAsync(
                    It.IsAny<string>(), It.IsAny<int>(),
                    It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success());
            Entity
                .Setup(e => e.ValidateWriteAsync(
                    It.IsAny<string>(), It.IsAny<int>(),
                    It.IsAny<AssetEntityMetadataWrite>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success());

            Repository
                .Setup(r => r.GetAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(existingRow ? Stored : null);
            Repository
                .Setup(r => r.AddAsync(It.IsAny<AssetMetadata>(), It.IsAny<CancellationToken>()))
                .Callback<AssetMetadata, CancellationToken>((m, _) => Added = m)
                .Returns(Task.CompletedTask);

            Read
                .Setup(r => r.Handle(It.IsAny<ReadAssetMetadataQuery>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(Result.Success(new AssetMetadataResponse(
                    Family, AssetId, "Chair", AssetMetadataSchema.Version, AssetMetadataSchema.Version,
                    Array.Empty<AssetMetadataValue>(),
                    new AssetMetadataCompleteness(0, 0, Array.Empty<string>()))));

            var clock = new Mock<IDateTimeProvider>();
            clock.SetupGet(c => c.UtcNow).Returns(new DateTime(2026, 8, 22, 0, 0, 0, DateTimeKind.Utc));

            _handler = new SetAssetMetadataCommandHandler(
                Entity.Object, Repository.Object, SearchDocuments.Object, Read.Object,
                clock.Object, UnitOfWork.Object);
        }

        public Task<Result<AssetMetadataResponse>> Handle(object fields, string family = Family)
            => Handle(JsonSerializer.Serialize(fields), family);

        public Task<Result<AssetMetadataResponse>> Handle(string json, string family = Family)
        {
            using var document = JsonDocument.Parse(json);
            var patch = document.RootElement.EnumerateObject()
                .ToDictionary(p => p.Name, p => p.Value.Clone(), StringComparer.Ordinal);

            return _handler.Handle(
                new SetAssetMetadataCommand(family, AssetId, patch), CancellationToken.None);
        }
    }
}
