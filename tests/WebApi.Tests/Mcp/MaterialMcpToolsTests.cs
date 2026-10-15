using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Materials;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The material MCP surface's effects handling: create forwards the document, update is a
/// patch where an explicit JSON null clears and an omitted parameter leaves the document
/// alone, and both reads carry what is stored.
/// </summary>
public class MaterialMcpToolsTests
{
    private static string Json(object value) =>
        JsonSerializer.Serialize(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    private static JsonElement Effects() => JsonSerializer.SerializeToElement(new
    {
        version = 1,
        effects = new object[] { new { type = "rim", color = "#7CFF2A", power = 3.0, intensity = 1.0 } },
    });

    private static JsonElement JsonNull() => JsonSerializer.SerializeToElement<object?>(null);

    private static MaterialDto Detail(int id = 1, JsonElement? effects = null) => new(
        id,
        "Glow Jelly",
        null,
        null,
        null,
        new MaterialParametersDto(
            1f, 1f, 1f, 1f, "#FFFFFF", 0.6f, 0f, 0f, 0f, 0f, 1f, 1f, 1.5f,
            AlphaMode.Opaque, 0.5f, false),
        "sphere",
        false,
        Array.Empty<string>(),
        DateTime.UtcNow,
        DateTime.UtcNow,
        effects);

    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "gen-1"));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    private static Mock<ICommandHandler<CreateMaterialCommand, CreateMaterialResponse>> Creator(
        Action<CreateMaterialCommand> captured)
    {
        var handler = new Mock<ICommandHandler<CreateMaterialCommand, CreateMaterialResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateMaterialCommand>(), It.IsAny<CancellationToken>()))
            .Callback<CreateMaterialCommand, CancellationToken>((command, _) => captured(command))
            .ReturnsAsync(Result.Success(new CreateMaterialResponse(7, "Glow Jelly")));
        return handler;
    }

    private static Mock<IQueryHandler<GetMaterialByIdQuery, MaterialDto>> Reader(MaterialDto detail)
    {
        var handler = new Mock<IQueryHandler<GetMaterialByIdQuery, MaterialDto>>();
        handler.Setup(h => h.Handle(It.IsAny<GetMaterialByIdQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(detail));
        return handler;
    }

    private static Mock<ICommandHandler<UpdateMaterialCommand, MaterialDto>> Updater(
        Action<UpdateMaterialCommand> captured)
    {
        var handler = new Mock<ICommandHandler<UpdateMaterialCommand, MaterialDto>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateMaterialCommand>(), It.IsAny<CancellationToken>()))
            .Callback<UpdateMaterialCommand, CancellationToken>((command, _) => captured(command))
            .ReturnsAsync(Result.Success(Detail()));
        return handler;
    }

    [Fact]
    public async Task CreateMaterial_WithEffects_PassesTheDocumentToTheCommand()
    {
        CreateMaterialCommand? captured = null;
        var handler = Creator(command => captured = command);

        var result = await MaterialWriteMcpTools.CreateMaterial(
            handler.Object, ClaimGranted().Object, Caller(),
            name: "Glow Jelly", idempotencyKey: "key-create", effects: Effects());

        Assert.Contains("\"ok\"", Json(result));
        Assert.NotNull(captured);
        Assert.NotNull(captured!.Effects);
        Assert.Contains("rim", captured.Effects!.Value.GetRawText());
    }

    [Fact]
    public async Task UpdateMaterial_WithEffects_ReplacesTheDocument()
    {
        UpdateMaterialCommand? captured = null;
        var handler = Updater(command => captured = command);

        var result = await MaterialWriteMcpTools.UpdateMaterial(
            handler.Object, Reader(Detail()).Object, ClaimGranted().Object, Caller(),
            materialId: 1, idempotencyKey: "key-set", effects: Effects());

        Assert.Contains("\"ok\"", Json(result));
        Assert.NotNull(captured);
        Assert.NotNull(captured!.Effects);
        Assert.False(captured.ClearEffects);
        Assert.Contains("rim", captured.Effects!.Value.GetRawText());
    }

    [Fact]
    public async Task UpdateMaterial_WithExplicitNull_ClearsTheDocument()
    {
        UpdateMaterialCommand? captured = null;
        var handler = Updater(command => captured = command);

        var result = await MaterialWriteMcpTools.UpdateMaterial(
            handler.Object, Reader(Detail(effects: Effects())).Object, ClaimGranted().Object, Caller(),
            materialId: 1, idempotencyKey: "key-clear", effects: JsonNull());

        Assert.Contains("\"ok\"", Json(result));
        Assert.NotNull(captured);
        Assert.True(captured!.ClearEffects);
        Assert.Null(captured.Effects);
    }

    [Fact]
    public async Task UpdateMaterial_WithOmittedEffects_LeavesTheDocumentAlone()
    {
        UpdateMaterialCommand? captured = null;
        var handler = Updater(command => captured = command);

        var result = await MaterialWriteMcpTools.UpdateMaterial(
            handler.Object, Reader(Detail(effects: Effects())).Object, ClaimGranted().Object, Caller(),
            materialId: 1, idempotencyKey: "key-keep", name: "Renamed");

        Assert.Contains("\"ok\"", Json(result));
        Assert.NotNull(captured);
        Assert.False(captured!.ClearEffects);
        Assert.Null(captured.Effects);
    }

    [Fact]
    public async Task GetMaterial_ReturnsTheStoredEffects()
    {
        var result = await MaterialReadMcpTools.GetMaterial(
            Reader(Detail(7, Effects())).Object, Caller(), materialId: 7);

        var json = Json(result);
        Assert.Contains("\"effects\"", json);
        Assert.Contains("rim", json);
        Assert.Contains("#7CFF2A", json);
    }

    [Fact]
    public async Task ListMaterials_ReturnsEffectsPerEntry()
    {
        var entry = new MaterialLibraryEntryDto(
            MaterialLibraryEntryKind.Material,
            7,
            "Glow Jelly",
            null,
            null,
            null,
            RequiresUvs: false,
            PreviewGeometryType: "sphere",
            HasThumbnail: false,
            Parameters: null,
            Tiling: null,
            Tags: Array.Empty<string>(),
            CreatedAt: DateTime.UtcNow,
            UpdatedAt: DateTime.UtcNow,
            Effects: Effects());
        var handler = new Mock<IQueryHandler<GetMaterialLibraryQuery, GetMaterialLibraryResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<GetMaterialLibraryQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new GetMaterialLibraryResponse([entry], 1)));

        var result = await MaterialReadMcpTools.ListMaterials(handler.Object, Caller());

        var json = Json(result);
        Assert.Contains("\"effects\"", json);
        Assert.Contains("rim", json);
    }
}
