using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Vfx;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The visual-effect MCP surface: the tools are thin pass-throughs, so what matters is
/// that an invalid definition surfaces every problem and that nothing is recorded as
/// applied when validation refused the write.
/// </summary>
public class VfxMcpToolsTests
{
    private static string Json(object value) =>
        JsonSerializer.Serialize(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    private static JsonElement Definition() => JsonSerializer.SerializeToElement(new
    {
        version = 1,
        duration = 2,
        loop = false,
        components = Array.Empty<object>(),
    });

    private static VfxDetailDto Detail(int id = 1) => new(
        id, "Sparks", null, Definition(), DateTime.UtcNow, DateTime.UtcNow);

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

    private static Mock<ICommandHandler<CreateVfxCommand, VfxWriteOutcome>> Creator(
        VfxWriteOutcome outcome)
    {
        var handler = new Mock<ICommandHandler<CreateVfxCommand, VfxWriteOutcome>>();
        handler.Setup(h => h.Handle(It.IsAny<CreateVfxCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(outcome));
        return handler;
    }

    private static Mock<IQueryHandler<GetVfxQuery, VfxDetailDto>> Reader(VfxDetailDto detail)
    {
        var handler = new Mock<IQueryHandler<GetVfxQuery, VfxDetailDto>>();
        handler.Setup(h => h.Handle(It.IsAny<GetVfxQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(detail));
        return handler;
    }

    [Fact]
    public async Task CreateVfx_WithAValidDefinition_AppliesTheWrite()
    {
        var handler = Creator(VfxWriteOutcome.Saved(Detail()));
        var audit = ClaimGranted();

        var result = await VfxWriteMcpTools.CreateVfx(
            handler.Object, audit.Object, Caller(), "Sparks", "key-create", definition: Definition());

        Assert.Contains("\"ok\"", Json(result));
        Assert.Contains("\"vfxId\":1", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<CreateVfxCommand>(), It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.CompleteAsync(
            "key-create", It.IsAny<string>(), "Vfx", 1,
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateVfx_WithAnInvalidDefinition_ReturnsEveryProblemAndAbandonsTheClaim()
    {
        var problems = new[]
        {
            new VfxProblem("components[0].particles.rate", "must be at most 2000."),
            new VfxProblem("components[2].mesh.modelId", "Model 999 was not found."),
        };
        var handler = Creator(VfxWriteOutcome.Invalid(problems));
        var audit = ClaimGranted();

        var result = await VfxWriteMcpTools.CreateVfx(
            handler.Object, audit.Object, Caller(), "Sparks", "key-invalid", definition: Definition());

        var json = Json(result);
        Assert.Contains("InvalidVfxDefinition", json);
        Assert.Contains("components[0].particles.rate", json);
        Assert.Contains("components[2].mesh.modelId", json);
        audit.Verify(a => a.CompleteAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.AbandonAsync(
            "key-invalid", It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task UpdateVfx_WhenTheEffectIsMissing_ReportsNotFoundWithoutWriting()
    {
        var getHandler = new Mock<IQueryHandler<GetVfxQuery, VfxDetailDto>>();
        getHandler.Setup(h => h.Handle(It.IsAny<GetVfxQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Failure<VfxDetailDto>(new Error("VfxNotFound", "missing")));

        var handler = new Mock<ICommandHandler<UpdateVfxCommand, VfxWriteOutcome>>();

        var result = await VfxWriteMcpTools.UpdateVfx(
            handler.Object, getHandler.Object, ClaimGranted().Object, Caller(),
            vfxId: 404, idempotencyKey: "key-missing");

        Assert.Contains("VfxNotFound", Json(result));
        handler.Verify(h => h.Handle(It.IsAny<UpdateVfxCommand>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UpdateVfx_ReplacesTheDefinitionAndRecordsThePreviousState()
    {
        var getHandler = Reader(Detail());
        var handler = new Mock<ICommandHandler<UpdateVfxCommand, VfxWriteOutcome>>();
        handler.Setup(h => h.Handle(It.IsAny<UpdateVfxCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(VfxWriteOutcome.Saved(Detail())));
        var audit = ClaimGranted();

        var result = await VfxWriteMcpTools.UpdateVfx(
            handler.Object, getHandler.Object, audit.Object, Caller(),
            vfxId: 1, idempotencyKey: "key-update", definition: Definition());

        Assert.Contains("\"ok\"", Json(result));
        // The previous definition must be recorded so reverse_operation can restore it.
        audit.Verify(a => a.CompleteAsync(
            "key-update", It.IsAny<string>(), "Vfx", 1,
            It.IsAny<string>(), It.Is<string?>(before => before != null), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ListVfx_ReturnsTheBrowseList()
    {
        var handler = new Mock<IQueryHandler<GetVfxListQuery, IReadOnlyList<VfxSummaryDto>>>();
        handler.Setup(h => h.Handle(It.IsAny<GetVfxListQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<VfxSummaryDto>>(
                [new VfxSummaryDto(1, "Sparks", null, 2, 0, [], DateTime.UtcNow)]));

        var result = await VfxReadMcpTools.ListVfx(handler.Object, Caller());

        Assert.Contains("Sparks", Json(result));
    }

    [Fact]
    public async Task GetVfx_ReturnsTheFullDefinition()
    {
        var result = await VfxReadMcpTools.GetVfx(Reader(Detail(7)).Object, Caller(), vfxId: 7);

        var json = Json(result);
        Assert.Contains("\"id\":7", json);
        Assert.Contains("\"definition\"", json);
    }

    // The thumbnail is how an agent (and the UI) tells effects apart without opening them,
    // so both read tools must carry its URL.
    [Fact]
    public async Task GetVfx_AndListVfx_CarryTheThumbnailUrl()
    {
        var url = "/vfx/7/thumbnail/file?v=abc";
        var detail = Detail(7) with { ThumbnailUrl = url };
        var list = new Mock<IQueryHandler<GetVfxListQuery, IReadOnlyList<VfxSummaryDto>>>();
        list.Setup(h => h.Handle(It.IsAny<GetVfxListQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success<IReadOnlyList<VfxSummaryDto>>(
                [new VfxSummaryDto(7, "Sparks", null, 2, 0, [], DateTime.UtcNow, url)]));

        var got = Json(await VfxReadMcpTools.GetVfx(Reader(detail).Object, Caller(), vfxId: 7));
        var listed = Json(await VfxReadMcpTools.ListVfx(list.Object, Caller()));

        Assert.Contains($"\"thumbnailUrl\":\"{url}\"", got.Replace("\\u0026", "&"));
        Assert.Contains("\"thumbnailUrl\":\"/vfx/7/thumbnail/file?v=abc\"", listed);
    }
}
