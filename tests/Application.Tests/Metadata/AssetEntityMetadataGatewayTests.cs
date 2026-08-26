using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.EnvironmentMaps;
using Application.Materials;
using Application.Metadata;
using Application.Models;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Metadata;

/// <summary>
/// Prevalidation is what makes a metadata patch all-or-nothing, so what it accepts has to
/// be exactly what the family's own command accepts - existence <b>and</b> kind.
///
/// The bug these cover: category trees are partitioned by <see cref="TextureSetKind"/>, a
/// cross-kind id exists, and an existence-only check therefore waved it through. The patch
/// then committed its tags with the first command and was refused by the second, leaving
/// the write half-applied and - on the agent surface, where a returned failure releases the
/// idempotency key - inviting a retry over the half that landed.
/// </summary>
public class AssetEntityMetadataGatewayTests
{
    private static readonly DateTime Now = new(2026, 8, 24, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task A_TextureSet_Is_Refused_A_Category_From_The_Other_Kind()
    {
        var fixture = new Fixture();
        fixture.WithTextureSet(id: 5, TextureSetKind.ModelSpecific);
        fixture.WithTextureSetCategory(id: 40, TextureSetKind.Universal, "Stone");

        var result = await fixture.Validate(
            AssetMetadataSchema.Families.TextureSet, assetId: 5, categoryId: 40);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryKindMismatch", result.Error.Code);
    }

    [Fact]
    public async Task A_TextureSet_Accepts_A_Category_Of_Its_Own_Kind()
    {
        var fixture = new Fixture();
        fixture.WithTextureSet(id: 5, TextureSetKind.ModelSpecific);
        fixture.WithTextureSetCategory(id: 41, TextureSetKind.ModelSpecific, "Baked");

        var result = await fixture.Validate(
            AssetMetadataSchema.Families.TextureSet, assetId: 5, categoryId: 41);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task A_Material_Is_Refused_A_Non_Universal_Category()
    {
        // Materials use the shared Universal vocabulary and only that one - the tag
        // vocabularies of the two kinds are deliberately separate.
        var fixture = new Fixture();
        fixture.WithTextureSetCategory(id: 42, TextureSetKind.ModelSpecific, "Baked");

        var result = await fixture.Validate(
            AssetMetadataSchema.Families.Material, assetId: 9, categoryId: 42);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryKindMismatch", result.Error.Code);
    }

    [Fact]
    public async Task A_Material_Accepts_A_Universal_Category()
    {
        var fixture = new Fixture();
        fixture.WithTextureSetCategory(id: 43, TextureSetKind.Universal, "Stone");

        var result = await fixture.Validate(
            AssetMetadataSchema.Families.Material, assetId: 9, categoryId: 43);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task A_Category_That_Does_Not_Exist_Is_Refused_For_Every_Family()
    {
        var fixture = new Fixture();

        foreach (var family in new[]
                 {
                     AssetMetadataSchema.Families.Model,
                     AssetMetadataSchema.Families.TextureSet,
                     AssetMetadataSchema.Families.Material,
                     AssetMetadataSchema.Families.EnvironmentMap,
                     AssetMetadataSchema.Families.Sound,
                     AssetMetadataSchema.Families.Sprite,
                 })
        {
            fixture.WithTextureSet(id: 1, TextureSetKind.Universal);
            var result = await fixture.Validate(family, assetId: 1, categoryId: 9999);

            Assert.True(result.IsFailure);
            Assert.Equal("CategoryNotFound", result.Error.Code);
        }
    }

    [Fact]
    public async Task Clearing_A_Category_Needs_No_Reference_Check()
    {
        var fixture = new Fixture();

        var result = await fixture.Validate(
            AssetMetadataSchema.Families.TextureSet, assetId: 5, categoryId: null);

        Assert.True(result.IsSuccess);
        // No texture set was set up, so a read would have failed - proving nothing was read.
        fixture.TextureSets.Verify(
            r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Write_That_Does_Not_Touch_The_Category_Is_Not_Validated()
    {
        var fixture = new Fixture();

        var result = await fixture.Gateway.ValidateWriteAsync(
            AssetMetadataSchema.Families.TextureSet,
            assetId: 5,
            new AssetEntityMetadataWrite(SetTags: true, Tags: new[] { "wood" }),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        fixture.TextureSetCategories.Verify(
            r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_TextureSet_That_Does_Not_Exist_Is_Refused_Before_Anything_Is_Written()
    {
        var fixture = new Fixture();
        fixture.WithTextureSetCategory(id: 44, TextureSetKind.Universal, "Stone");

        var result = await fixture.Validate(
            AssetMetadataSchema.Families.TextureSet, assetId: 404, categoryId: 44);

        Assert.True(result.IsFailure);
        Assert.Equal("AssetNotFound", result.Error.Code);
    }

    private sealed class Fixture
    {
        public readonly Mock<ITextureSetRepository> TextureSets = new();
        public readonly Mock<ITextureSetCategoryRepository> TextureSetCategories = new();
        public readonly Mock<IModelCategoryRepository> ModelCategories = new();
        public readonly Mock<ISoundCategoryRepository> SoundCategories = new();
        public readonly Mock<ISpriteCategoryRepository> SpriteCategories = new();
        public readonly Mock<IEnvironmentMapCategoryRepository> EnvironmentMapCategories = new();

        public readonly AssetEntityMetadataGateway Gateway;

        public Fixture()
        {
            Gateway = new AssetEntityMetadataGateway(
                new Mock<IModelRepository>().Object,
                TextureSets.Object,
                new Mock<IMaterialRepository>().Object,
                new Mock<IEnvironmentMapRepository>().Object,
                new Mock<ISoundRepository>().Object,
                new Mock<ISpriteRepository>().Object,
                ModelCategories.Object,
                TextureSetCategories.Object,
                SoundCategories.Object,
                SpriteCategories.Object,
                EnvironmentMapCategories.Object,
                new Mock<ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse>>().Object,
                new Mock<ICommandHandler<UpdateTextureSetTagsCommand, UpdateTextureSetTagsResponse>>().Object,
                new Mock<ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse>>().Object,
                new Mock<ICommandHandler<UpdateMaterialTagsCommand, UpdateMaterialTagsResponse>>().Object,
                new Mock<ICommandHandler<UpdateMaterialCommand, MaterialDto>>().Object,
                new Mock<ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse>>().Object,
                new Mock<ICommandHandler<UpdateSoundCommand, UpdateSoundResponse>>().Object,
                new Mock<ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse>>().Object,
                new Mock<ICommandHandler<UpdateSoundMetadataCommand, UpdateSoundMetadataResponse>>().Object,
                new Mock<ICommandHandler<UpdateSpriteMetadataCommand, UpdateSpriteMetadataResponse>>().Object);
        }

        public void WithTextureSet(int id, TextureSetKind kind) =>
            TextureSets
                .Setup(r => r.GetByIdAsync(id, It.IsAny<CancellationToken>()))
                .ReturnsAsync(TextureSet.Create($"set-{id}", Now, kind));

        public void WithTextureSetCategory(int id, TextureSetKind kind, string name) =>
            TextureSetCategories
                .Setup(r => r.GetByIdAsync(id, It.IsAny<CancellationToken>()))
                .ReturnsAsync(TextureSetCategory.Create(name, null, null, kind, Now));

        public Task<Result> Validate(string family, int assetId, int? categoryId) =>
            Gateway.ValidateWriteAsync(
                family,
                assetId,
                new AssetEntityMetadataWrite(SetCategory: true, CategoryId: categoryId),
                CancellationToken.None);
    }
}
