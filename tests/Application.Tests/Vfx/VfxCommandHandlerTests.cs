using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Models;
using Application.Vfx;
using Domain.Models;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Vfx;

public class VfxCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 10, 7, 12, 0, 0, DateTimeKind.Utc);

    private const string DefaultJson = """{"version":1,"duration":2,"loop":false,"components":[]}""";

    private const string MeshDefinition = """
        {"version":1,"duration":2,"loop":false,"components":[
          {"id":"rock","type":"mesh","name":"Rock","start":0,"duration":1,
           "mesh":{"modelId":12,"versionId":34}}]}
        """;

    private const string MeshDefinitionWithoutVersion = """
        {"version":1,"duration":2,"loop":false,"components":[
          {"id":"rock","type":"mesh","name":"Rock","start":0,"duration":1,
           "mesh":{"modelId":12}}]}
        """;

    private const string SoundDefinition = """
        {"version":1,"duration":2,"loop":false,"components":[
          {"id":"boom","type":"sound","name":"Boom","start":0,"duration":1,
           "sound":{"soundId":9,"volume":1}}]}
        """;

    private const string SpriteParticlesDefinition = """
        {"version":1,"duration":2,"loop":false,"components":[
          {"id":"sparks","type":"particles","name":"Sparks","start":0,"duration":1,
           "particles":{"mode":"burst","rate":1,"count":1,"lifetime":1,"speed":1,"spread":10,
             "gravity":0,"sizeStart":1,"sizeEnd":1,"colorStart":"#ffffff","colorEnd":"#000000",
             "opacityStart":1,"opacityEnd":0,"blending":"normal","spriteId":7,"seed":1}}]}
        """;

    private readonly Mock<IVfxRepository> _vfx = new();
    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<ISoundRepository> _sounds = new();
    private readonly Mock<ISpriteRepository> _sprites = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    public VfxCommandHandlerTests()
    {
        _clock.Setup(c => c.UtcNow).Returns(Now);
        _vfx.Setup(r => r.AddAsync(It.IsAny<Domain.Models.Vfx>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Domain.Models.Vfx entity, CancellationToken _) => entity);

        _models.Setup(r => r.GetIdentitiesAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelIdentity>());
        _versions.Setup(r => r.GetByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<ModelVersion>());
        _sprites.Setup(r => r.GetByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<Sprite>());
        _sounds.Setup(r => r.GetByIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Sound?)null);
    }

    private CreateVfxCommandHandler CreateHandler() => new(
        _vfx.Object, _models.Object, _versions.Object, _sounds.Object, _sprites.Object,
        _clock.Object, _unitOfWork.Object);

    private UpdateVfxCommandHandler UpdateHandler() => new(
        _vfx.Object, _models.Object, _versions.Object, _sounds.Object, _sprites.Object,
        _clock.Object, _unitOfWork.Object);

    private DeleteVfxCommandHandler DeleteHandler() => new(_vfx.Object, _unitOfWork.Object);

    private static JsonElement Json(string json) => JsonSerializer.Deserialize<JsonElement>(json);

    [Fact]
    public async Task Create_WithNoDefinition_StoresTheDefault()
    {
        var result = await CreateHandler().Handle(new CreateVfxCommand("Sparks"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsValid);

        var saved = result.Value.Vfx!;
        var definition = saved.Definition;
        Assert.Equal(1, definition.GetProperty("version").GetInt32());
        Assert.False(definition.GetProperty("loop").GetBoolean());
        Assert.Empty(definition.GetProperty("components").EnumerateArray());
        _unitOfWork.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Create_WithExistingMeshReference_Saves()
    {
        _models.Setup(r => r.GetIdentitiesAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new ModelIdentity(12, "Rock", 34)]);
        _versions.Setup(r => r.GetByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([ModelVersion.Create(12, 1, null, Now).WithId(34)]);

        var result = await CreateHandler().Handle(
            new CreateVfxCommand("Rockfall", Definition: Json(MeshDefinition)), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsValid);
        _vfx.Verify(r => r.AddAsync(It.IsAny<Domain.Models.Vfx>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Create_WithMeshWithoutVersion_PinsTheActiveVersion()
    {
        _models.Setup(r => r.GetIdentitiesAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new ModelIdentity(12, "Rock", 34)]);

        var result = await CreateHandler().Handle(
            new CreateVfxCommand("Rockfall", Definition: Json(MeshDefinitionWithoutVersion)), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsValid);

        var mesh = result.Value.Vfx!.Definition.GetProperty("components")[0].GetProperty("mesh");
        Assert.Equal(34, mesh.GetProperty("versionId").GetInt32());
        _vfx.Verify(r => r.AddAsync(It.IsAny<Domain.Models.Vfx>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Create_WithMissingModel_ReportsThePathAndWritesNothing()
    {
        var result = await CreateHandler().Handle(
            new CreateVfxCommand("Rockfall", Definition: Json(MeshDefinition)), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.IsValid);
        Assert.Contains(result.Value.Problems, p => p.Path == "components[0].mesh.modelId");
        _vfx.Verify(r => r.AddAsync(It.IsAny<Domain.Models.Vfx>(), It.IsAny<CancellationToken>()), Times.Never);
        _unitOfWork.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Create_WithMissingVersion_ReportsThePath()
    {
        _models.Setup(r => r.GetIdentitiesAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new ModelIdentity(12, "Rock", 34)]);

        var result = await CreateHandler().Handle(
            new CreateVfxCommand("Rockfall", Definition: Json(MeshDefinition)), CancellationToken.None);

        Assert.False(result.Value.IsValid);
        Assert.Equal("components[0].mesh.versionId",
            Assert.Single(result.Value.Problems, p => p.Path == "components[0].mesh.versionId").Path);
    }

    [Fact]
    public async Task Create_WithMissingSound_ReportsThePath()
    {
        var result = await CreateHandler().Handle(
            new CreateVfxCommand("Boom", Definition: Json(SoundDefinition)), CancellationToken.None);

        Assert.False(result.Value.IsValid);
        Assert.Single(result.Value.Problems, p => p.Path == "components[0].sound.soundId");
    }

    [Fact]
    public async Task Create_WithMissingSprite_ReportsThePath()
    {
        var result = await CreateHandler().Handle(
            new CreateVfxCommand("Sparks", Definition: Json(SpriteParticlesDefinition)), CancellationToken.None);

        Assert.False(result.Value.IsValid);
        Assert.Single(result.Value.Problems, p => p.Path == "components[0].particles.spriteId");
    }

    [Fact]
    public async Task Update_WithUnknownId_ReportsNotFound()
    {
        _vfx.Setup(r => r.GetByIdAsync(404, It.IsAny<CancellationToken>())).ReturnsAsync((Domain.Models.Vfx?)null);

        var result = await UpdateHandler().Handle(new UpdateVfxCommand(404), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("VfxNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Update_WithNameOnly_LeavesTheDefinitionAlone()
    {
        var vfx = Domain.Models.Vfx.Create("Old", null, DefaultJson, Now);
        _vfx.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);

        var result = await UpdateHandler().Handle(
            new UpdateVfxCommand(1, Name: "New"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsValid);
        Assert.Equal("New", vfx.Name);
        Assert.Equal(DefaultJson, vfx.DefinitionJson);
    }

    [Fact]
    public async Task Update_WithInvalidDefinition_DoesNotPersistTheNameChange()
    {
        // The command handler commits on a success Result, so a rejected definition must
        // not leave a rename or a description behind.
        var vfx = Domain.Models.Vfx.Create("Old", null, DefaultJson, Now);
        _vfx.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);
        var invalid = Json("""{"version":2,"duration":0,"loop":false,"components":[]}""");

        var result = await UpdateHandler().Handle(
            new UpdateVfxCommand(1, Name: "New", Definition: invalid), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.IsValid);
        Assert.Equal("Old", vfx.Name);
        _vfx.Verify(r => r.UpdateAsync(It.IsAny<Domain.Models.Vfx>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Update_WithValidDefinition_ReplacesIt()
    {
        var vfx = Domain.Models.Vfx.Create("Rockfall", null, DefaultJson, Now);
        _vfx.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);
        _models.Setup(r => r.GetIdentitiesAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new ModelIdentity(12, "Rock", 34)]);
        _versions.Setup(r => r.GetByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([ModelVersion.Create(12, 1, null, Now).WithId(34)]);

        var result = await UpdateHandler().Handle(
            new UpdateVfxCommand(1, Definition: Json(MeshDefinition)), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.True(result.Value.IsValid);
        Assert.Contains("\"id\":\"rock\"", vfx.DefinitionJson);
    }

    [Fact]
    public async Task Delete_RemovesTheEffect()
    {
        var vfx = Domain.Models.Vfx.Create("Sparks", null, DefaultJson, Now);
        _vfx.Setup(r => r.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);

        var result = await DeleteHandler().Handle(new DeleteVfxCommand(1), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Sparks", result.Value.Name);
        _vfx.Verify(r => r.DeleteAsync(1, It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWork.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Delete_WithUnknownId_ReportsNotFound()
    {
        _vfx.Setup(r => r.GetByIdAsync(404, It.IsAny<CancellationToken>())).ReturnsAsync((Domain.Models.Vfx?)null);

        var result = await DeleteHandler().Handle(new DeleteVfxCommand(404), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("VfxNotFound", result.Error.Code);
    }
}
