using Application.Abstractions.Repositories;
using Application.Materials;
using Application.Tests;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Materials;

/// <summary>
/// The merged browse surface. These are the tests that hold the design decision
/// in place: two entities, one list, and exactly one place where they are joined.
/// </summary>
public class GetMaterialLibraryQueryHandlerTests
{
    private static readonly DateTime Now = new(2026, 8, 17, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IMaterialRepository> _materials = new();
    private readonly Mock<ITextureSetRepository> _textureSets = new();

    private GetMaterialLibraryQueryHandler Handler() => new(_materials.Object, _textureSets.Object);

    private void GivenMaterials(params Material[] materials) =>
        _materials
            .Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(materials);

    private void GivenGlobalMaterials(params TextureSet[] textureSets) =>
        _textureSets
            .Setup(r => r.GetPagedAsync(
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<IReadOnlyCollection<int>?>(),
                It.IsAny<IReadOnlyCollection<int>?>(), It.IsAny<IReadOnlyCollection<int>?>(),
                It.IsAny<IReadOnlyCollection<TextureType>?>(), It.IsAny<TextureSetKind?>(),
                It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<IReadOnlyCollection<string>?>(),
                It.IsAny<bool?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((textureSets, textureSets.Length));

    [Fact]
    public async Task Merges_BothKinds_IntoOneAlphabeticalList()
    {
        GivenMaterials(Material.Create("Brass", MaterialParameters.Create(metallic: 1f), Now));
        GivenGlobalMaterials(TextureSet.Create("Oak Planks", Now, TextureSetKind.Universal));

        var result = await Handler().Handle(new GetMaterialLibraryQuery(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(new[] { "Brass", "Oak Planks" }, result.Value.Entries.Select(e => e.Name));
        Assert.Equal(2, result.Value.TotalCount);
    }

    [Fact]
    public async Task Entries_CarryRequiresUvs_SoACallerNeverHasToKnowTheTable()
    {
        GivenMaterials(Material.Create("Brass", MaterialParameters.Default, Now));
        GivenGlobalMaterials(TextureSet.Create("Oak Planks", Now, TextureSetKind.Universal));

        var result = await Handler().Handle(new GetMaterialLibraryQuery(), CancellationToken.None);

        var brass = result.Value.Entries.Single(e => e.Name == "Brass");
        var oak = result.Value.Entries.Single(e => e.Name == "Oak Planks");

        Assert.False(brass.RequiresUvs);
        Assert.NotNull(brass.Parameters);
        Assert.Null(brass.Tiling);

        Assert.True(oak.RequiresUvs);
        Assert.Null(oak.Parameters);
        Assert.NotNull(oak.Tiling);
    }

    [Fact]
    public async Task RequiresUvsFalse_ReturnsOnlyParameterMaterials_AndDoesNotQueryTextureSets()
    {
        // An agent dressing a badly-unwrapped asset asks for this. Not querying the
        // other side at all is the cheap half of the answer.
        GivenMaterials(Material.Create("Brass", MaterialParameters.Default, Now));

        var result = await Handler().Handle(
            new GetMaterialLibraryQuery(RequiresUvs: false), CancellationToken.None);

        Assert.Single(result.Value.Entries);
        Assert.Equal("Brass", result.Value.Entries[0].Name);
        _textureSets.Verify(r => r.GetPagedAsync(
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<IReadOnlyCollection<int>?>(),
            It.IsAny<IReadOnlyCollection<int>?>(), It.IsAny<IReadOnlyCollection<int>?>(),
            It.IsAny<IReadOnlyCollection<TextureType>?>(), It.IsAny<TextureSetKind?>(),
            It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<IReadOnlyCollection<string>?>(),
            It.IsAny<bool?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task RequiresUvsTrue_ReturnsOnlyGlobalMaterials()
    {
        GivenGlobalMaterials(TextureSet.Create("Oak Planks", Now, TextureSetKind.Universal));

        var result = await Handler().Handle(
            new GetMaterialLibraryQuery(RequiresUvs: true), CancellationToken.None);

        Assert.Single(result.Value.Entries);
        Assert.Equal("Oak Planks", result.Value.Entries[0].Name);
        _materials.Verify(r => r.GetAllAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SearchName_MatchesAcrossBothKinds()
    {
        GivenMaterials(
            Material.Create("Oak Stain", MaterialParameters.Default, Now),
            Material.Create("Brass", MaterialParameters.Default, Now));
        GivenGlobalMaterials(TextureSet.Create("Oak Planks", Now, TextureSetKind.Universal));

        var result = await Handler().Handle(
            new GetMaterialLibraryQuery(SearchName: "oak"), CancellationToken.None);

        Assert.Equal(new[] { "Oak Planks", "Oak Stain" }, result.Value.Entries.Select(e => e.Name));
    }

    [Fact]
    public async Task Paging_AppliesAfterTheMerge_NotBeforeIt()
    {
        // Page 2 of a merge is not the merge of the two page 2s. This is the test
        // that fails if anyone "optimises" the handler into paging each side.
        GivenMaterials(
            Material.Create("A material", MaterialParameters.Default, Now),
            Material.Create("C material", MaterialParameters.Default, Now));
        GivenGlobalMaterials(
            TextureSet.Create("B global", Now, TextureSetKind.Universal),
            TextureSet.Create("D global", Now, TextureSetKind.Universal));

        var result = await Handler().Handle(
            new GetMaterialLibraryQuery(Page: 2, PageSize: 2), CancellationToken.None);

        Assert.Equal(new[] { "C material", "D global" }, result.Value.Entries.Select(e => e.Name));
        Assert.Equal(4, result.Value.TotalCount);
        Assert.Equal(2, result.Value.TotalPages);
    }

    private static TextureSet OakPlanksIn(int categoryId)
    {
        var textureSet = TextureSet.Create("Oak Planks", Now, TextureSetKind.Universal);
        textureSet.AssignCategory(categoryId, Now);

        return textureSet;
    }

    [Fact]
    public async Task CategoryFilter_AppliesToBothKinds()
    {
        GivenMaterials(
            Material.Create("Brass", MaterialParameters.Default, Now, categoryId: 3),
            Material.Create("Copper", MaterialParameters.Default, Now, categoryId: 8));
        GivenGlobalMaterials(
            OakPlanksIn(3));

        var result = await Handler().Handle(
            new GetMaterialLibraryQuery(CategoryIds: new[] { 3 }), CancellationToken.None);

        Assert.Equal(new[] { "Brass", "Oak Planks" }, result.Value.Entries.Select(e => e.Name));
    }
}
