using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Sounds;
using Application.Sprites;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The one import tool for the single-file families. <c>import_sound</c>,
/// <c>import_sprite</c> and <c>import_environment_map</c> merged into
/// <c>import_asset(assetType, path)</c>; these pin that the family dispatch reaches the
/// right handler and that the audit keeps the family-specific operation names, which is
/// what <c>reverse_operation</c> reverses by.
/// </summary>
public class AssetImportMcpToolsTests
{
    private static string Json(object value) => JsonSerializer.Serialize(value);

    /// <summary>An unauthenticated local caller - every scope, no identity (no MCP_TOKENS configured).</summary>
    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    /// <summary>An audit whose claim always succeeds (the key was free).</summary>
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

    /// <summary>A server-readable file with a family-appropriate extension.</summary>
    private static string TempFile(string extension)
    {
        var path = Path.Combine(Path.GetTempPath(), $"mcp-import-{Guid.NewGuid():N}{extension}");
        File.WriteAllBytes(path, [1, 2, 3]);
        return path;
    }

    private static Mock<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>> SoundHandler()
    {
        var handler = new Mock<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateSoundWithFileCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new CreateSoundWithFileResponse(11, "tone", 22, 0, 4096)));
        return handler;
    }

    private static Mock<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>> SpriteHandler()
    {
        var handler = new Mock<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateSpriteWithFileCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new CreateSpriteWithFileResponse(11, "icon", 22, SpriteType.Static, 4096)));
        return handler;
    }

    private static Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>> EnvironmentMapHandler()
    {
        var handler = new Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateEnvironmentMapWithFileCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new CreateEnvironmentMapWithFileResponse(11, "sky", 33, 22, null, "Equirectangular")));
        return handler;
    }

    [Fact]
    public async Task ImportAsset_Imports_A_Sound_With_The_Sound_Operation()
    {
        var path = TempFile(".wav");
        try
        {
            var sound = SoundHandler();
            var audit = ClaimGranted();

            var result = await AssetImportMcpTools.ImportAsset(
                sound.Object, new Mock<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>>().Object,
                new Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>>().Object,
                audit.Object, Caller(), "Sound", path, "key-1", name: "tone");

            Assert.Contains("\"ok\"", Json(result));
            sound.Verify(h => h.Handle(
                It.Is<CreateSoundWithFileCommand>(c => c.Name == "tone"),
                It.IsAny<CancellationToken>()), Times.Once);
            // The operation keeps its family name: reverse_operation recycles imports by
            // operation, and a merged tool must not orphan that inverse.
            audit.Verify(a => a.CompleteAsync(
                "key-1", "gen-1", "Sound", 11, It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task ImportAsset_Imports_A_Sprite_And_Parses_Its_Type()
    {
        var path = TempFile(".png");
        try
        {
            var sprite = SpriteHandler();
            var audit = ClaimGranted();

            var result = await AssetImportMcpTools.ImportAsset(
                new Mock<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>().Object,
                sprite.Object,
                new Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>>().Object,
                audit.Object, Caller(), "Sprite", path, "key-2", spriteType: "SpriteSheet");

            Assert.Contains("\"ok\"", Json(result));
            sprite.Verify(h => h.Handle(
                It.Is<CreateSpriteWithFileCommand>(c => c.SpriteType == SpriteType.SpriteSheet),
                It.IsAny<CancellationToken>()), Times.Once);
            audit.Verify(a => a.CompleteAsync(
                "key-2", "gen-1", "Sprite", 11, It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task ImportAsset_Imports_An_Environment_Map_With_Its_Size_Label()
    {
        var path = TempFile(".hdr");
        try
        {
            var environmentMap = EnvironmentMapHandler();
            var audit = ClaimGranted();

            var result = await AssetImportMcpTools.ImportAsset(
                new Mock<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>().Object,
                new Mock<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>>().Object,
                environmentMap.Object,
                audit.Object, Caller(), "EnvironmentMap", path, "key-3", sizeLabel: "4k");

            Assert.Contains("\"ok\"", Json(result));
            environmentMap.Verify(h => h.Handle(
                It.Is<CreateEnvironmentMapWithFileCommand>(c => c.SizeLabel == "4k"),
                It.IsAny<CancellationToken>()), Times.Once);
            audit.Verify(a => a.CompleteAsync(
                "key-3", "gen-1", "EnvironmentMap", 11, It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<CancellationToken>()), Times.Once);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task ImportAsset_Refuses_An_Unknown_Type_Without_Claiming_The_Key()
    {
        // A denied call must not burn the idempotency key: the tool declines before it
        // touches anything.
        var audit = new Mock<IAgentAudit>();

        var result = await AssetImportMcpTools.ImportAsset(
            new Mock<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>().Object,
            new Mock<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>>().Object,
            new Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>>().Object,
            audit.Object, Caller(), "Model", "/no/such/model.glb", "key-4");

        var json = Json(result);
        Assert.Contains("UnknownAssetType", json);
        // The reply says where the other two shapes live, so the retry is the right call.
        Assert.Contains("import_model", json);
        audit.Verify(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ImportAsset_Unreadable_Path_Releases_The_Claim()
    {
        var audit = ClaimGranted();

        var result = await AssetImportMcpTools.ImportAsset(
            SoundHandler().Object,
            new Mock<ICommandHandler<CreateSpriteWithFileCommand, CreateSpriteWithFileResponse>>().Object,
            new Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>>().Object,
            audit.Object, Caller(), "Sound", "/nonexistent/nope.wav", "key-5");

        Assert.Contains("PathNotFound", Json(result));
        audit.Verify(a => a.AbandonAsync("key-5", "gen-1", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ImportAsset_Rejects_An_Invalid_Sprite_Type_With_The_Valid_Values()
    {
        var path = TempFile(".png");
        try
        {
            var sprite = SpriteHandler();
            var result = await AssetImportMcpTools.ImportAsset(
                new Mock<ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>>().Object,
                sprite.Object,
                new Mock<ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>>().Object,
                ClaimGranted().Object, Caller(), "Sprite", path, "key-6", spriteType: "Bouncy");

            var json = Json(result);
            Assert.Contains("InvalidSpriteType", json);
            Assert.Contains("SpriteSheet", json);
            sprite.Verify(
                h => h.Handle(It.IsAny<CreateSpriteWithFileCommand>(), It.IsAny<CancellationToken>()), Times.Never);
        }
        finally
        {
            File.Delete(path);
        }
    }
}
