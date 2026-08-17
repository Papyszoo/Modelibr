using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Materials;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Materials;

public class MaterialCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 8, 17, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IMaterialRepository> _materials = new();
    private readonly Mock<ITextureSetCategoryRepository> _categories = new();
    private readonly Mock<IModelTagRepository> _tags = new();
    private readonly Mock<ISettingRepository> _settings = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    public MaterialCommandHandlerTests()
    {
        _clock.Setup(c => c.UtcNow).Returns(Now);
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => material);
    }

    private CreateMaterialCommandHandler CreateHandler() => new(
        _materials.Object, _categories.Object, _tags.Object,
        _settings.Object, _clock.Object, _unitOfWork.Object);

    private UpdateMaterialCommandHandler UpdateHandler() => new(
        _materials.Object, _categories.Object, _clock.Object, _unitOfWork.Object);

    [Fact]
    public async Task Create_WithNoParametersAtAll_Succeeds()
    {
        // The point of the type: inventing a material must cost nothing. No files,
        // no channels, not even a colour if the caller has not decided on one.
        Material? saved = null;
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => saved = material);

        var result = await CreateHandler().Handle(new CreateMaterialCommand("Plain White"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(saved);
        Assert.Equal(1f, saved!.Parameters.BaseColorR);
        Assert.False(saved.RequiresUvs);
    }

    [Fact]
    public async Task Create_WithHexColour_StoresLinearFactors()
    {
        Material? saved = null;
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => saved = material);

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Matte Black Plastic",
                new MaterialParametersRequest(BaseColorHex: "#1A1A1A", Roughness: 0.6f)),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0.6f, saved!.Parameters.Roughness);
        Assert.True(saved.Parameters.BaseColorR < 0.02f, "sRGB #1A is ~0.0125 in linear space, not 0.10");
    }

    [Fact]
    public async Task Create_WithModelSpecificCategory_IsRefused()
    {
        // Materials and global materials share the Universal vocabulary. A
        // ModelSpecific category belongs to one model's baked textures, and a
        // material filed under it could never be browsed from the merged grid.
        _categories
            .Setup(r => r.GetByIdAsync(4, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TextureSetCategory.Create("Bakes", null, null, TextureSetKind.ModelSpecific, Now));

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Oak", CategoryId: 4), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("CategoryKindMismatch", result.Error.Code);
        _materials.Verify(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_WithUniversalCategory_IsAccepted()
    {
        _categories
            .Setup(r => r.GetByIdAsync(9, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TextureSetCategory.Create("Wood", null, null, TextureSetKind.Universal, Now));

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Oak", CategoryId: 9), CancellationToken.None);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task Update_IsAPatch_AndLeavesUnmentionedParametersAlone()
    {
        var material = Material.Create("Oak",
            MaterialParameters.Create(baseColorR: 0.4f, baseColorG: 0.2f, baseColorB: 0.1f, roughness: 0.9f),
            Now);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, Parameters: new MaterialParametersRequest(Roughness: 0.3f)),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0.3f, material.Parameters.Roughness);
        Assert.Equal(0.4f, material.Parameters.BaseColorR);
    }

    [Fact]
    public async Task Update_WithClearCategory_RemovesIt()
    {
        var material = Material.Create("Oak", MaterialParameters.Default, Now, categoryId: 9);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, ClearCategory: true), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(material.CategoryId);
    }

    [Fact]
    public async Task Update_WithNeitherIdNorClear_LeavesTheCategoryWhereItWas()
    {
        // A null CategoryId cannot be told apart from "not mentioned", which is
        // why clearing needs its own flag.
        var material = Material.Create("Oak", MaterialParameters.Default, Now, categoryId: 9);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, Name: "Oak Dark"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(9, material.CategoryId);
    }

    [Fact]
    public async Task Update_WithUnknownId_ReportsNotFound()
    {
        _materials
            .Setup(r => r.GetByIdAsync(404, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material?)null);

        var result = await UpdateHandler().Handle(new UpdateMaterialCommand(404), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("MaterialNotFound", result.Error.Code);
    }
}
