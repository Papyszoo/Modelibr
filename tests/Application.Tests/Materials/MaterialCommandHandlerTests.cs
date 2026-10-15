using System.Text.Json;
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

    private static JsonElement Effects() => JsonSerializer.SerializeToElement(new
    {
        version = 1,
        effects = new object[]
        {
            new { type = "jelly_wobble", amplitude = 0.03, frequency = 1.5, waveScale = 4.0, seed = 0 },
            new { type = "rim", color = "#7CFF2A", power = 3.0, intensity = 1.0 },
        },
    });

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
    public async Task Create_WithHexAndFloatComponents_LetsTheHexWin()
    {
        // MaterialParametersRequest documents the hex as the deliberate one, so
        // it wins outright when both are given. `BaseColorR ?? basis.BaseColorR`
        // inverted that: a caller sending both got the floats, and a picked
        // colour silently became a different one.
        Material? saved = null;
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => saved = material);

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Contradictory",
                new MaterialParametersRequest(
                    BaseColorHex: "#1A1A1A",
                    BaseColorR: 1f,
                    BaseColorG: 1f,
                    BaseColorB: 1f)),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(saved!.Parameters.BaseColorR < 0.02f,
            "the hex is authoritative, so #1A's linear ~0.0125 must survive the 1.0 components");
        Assert.True(saved.Parameters.BaseColorG < 0.02f);
        Assert.True(saved.Parameters.BaseColorB < 0.02f);
    }

    [Fact]
    public async Task Create_WithFloatComponentsOnly_UsesThem()
    {
        // The other half of the precedence rule: with no hex, the components
        // are the only colour on offer and must still be applied.
        Material? saved = null;
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => saved = material);

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Components",
                new MaterialParametersRequest(BaseColorR: 0.25f, BaseColorG: 0.5f)),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0.25f, saved!.Parameters.BaseColorR);
        Assert.Equal(0.5f, saved.Parameters.BaseColorG);
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

    // ── Effects ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_WithValidEffects_StoresTheCanonicalDocument()
    {
        Material? saved = null;
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => saved = material);

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Glow Jelly", Effects: Effects()), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(saved!.EffectsJson);
        Assert.Contains("\"jelly_wobble\"", saved.EffectsJson);
        Assert.Contains("\"rim\"", saved.EffectsJson);
    }

    [Fact]
    public async Task Create_WithoutEffects_LeavesTheDocumentNull()
    {
        Material? saved = null;
        _materials
            .Setup(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Material material, CancellationToken _) => saved = material);

        var result = await CreateHandler().Handle(new CreateMaterialCommand("Plain"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(saved!.EffectsJson);
    }

    [Fact]
    public async Task Create_WithInvalidEffects_FailsWithoutSaving()
    {
        var bad = JsonSerializer.SerializeToElement(new
        {
            version = 1,
            effects = new object[] { new { type = "rim", color = "orange", power = 3.0, intensity = 1.0 } },
        });

        var result = await CreateHandler().Handle(
            new CreateMaterialCommand("Bad", Effects: bad), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidMaterialEffects", result.Error.Code);
        Assert.Contains("effects[0].color", result.Error.Message);
        _materials.Verify(r => r.AddAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetMaterialById_CarriesTheStoredEffects()
    {
        var material = Material.Create("Glow Jelly", MaterialParameters.Default, Now);
        material.SetEffects(
            """{"version":1,"effects":[{"type":"rim","color":"#7CFF2A","power":3,"intensity":1}]}""", Now);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await new GetMaterialByIdQueryHandler(_materials.Object)
            .Handle(new GetMaterialByIdQuery(1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value.Effects);
        Assert.Equal(JsonValueKind.Object, result.Value.Effects!.Value.ValueKind);
        Assert.Equal("#7CFF2A", result.Value.Effects.Value.GetProperty("effects")[0].GetProperty("color").GetString());
    }

    [Fact]
    public async Task Update_WithEffects_ReplacesTheDocument()
    {
        var material = Material.Create("Oak", MaterialParameters.Default, Now);
        material.SetEffects("""{"version":1,"effects":[]}""", Now);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, Effects: Effects()), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Contains("\"jelly_wobble\"", material.EffectsJson);
        Assert.NotNull(result.Value.Effects);
    }

    [Fact]
    public async Task Update_WithClearEffects_RemovesTheDocument()
    {
        var material = Material.Create("Oak", MaterialParameters.Default, Now);
        material.SetEffects("""{"version":1,"effects":[]}""", Now);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, ClearEffects: true), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(material.EffectsJson);
        Assert.Null(result.Value.Effects);
    }

    [Fact]
    public async Task Update_WithNoEffectsMentioned_LeavesTheDocumentAlone()
    {
        // A null Effects cannot be told apart from "not mentioned", which is why
        // clearing needs its own flag.
        var material = Material.Create("Oak", MaterialParameters.Default, Now);
        material.SetEffects("""{"version":1,"effects":[]}""", Now);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, Name: "Oak Dark"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("""{"version":1,"effects":[]}""", material.EffectsJson);
    }

    [Fact]
    public async Task Update_WithInvalidEffects_FailsWithoutSaving()
    {
        var material = Material.Create("Oak", MaterialParameters.Default, Now);
        _materials
            .Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var bad = JsonSerializer.SerializeToElement(new
        {
            version = 2,
            effects = Array.Empty<object>(),
        });

        var result = await UpdateHandler().Handle(
            new UpdateMaterialCommand(1, Effects: bad), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidMaterialEffects", result.Error.Code);
        _materials.Verify(r => r.UpdateAsync(It.IsAny<Material>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
