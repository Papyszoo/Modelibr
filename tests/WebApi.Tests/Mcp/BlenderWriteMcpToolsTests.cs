using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Blender;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// convert_model's bakeForWeb flag has to reach the convert-format spec, because
/// the spec is what validates and normalises it - and what refuses a bake into a
/// geometry-only format. The tool deliberately does not restate those rules, so
/// these tests run the real spec on exactly what the tool sends: if the tool
/// stopped serializing the flag, or renamed it, nothing else would notice.
/// </summary>
public class BlenderWriteMcpToolsTests
{
    private static McpCallerContext Caller() => McpCallerContext.Unauthenticated();

    private static string Json(object value) => JsonSerializer.Serialize(value);

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
        audit.Setup(a => a.InterruptAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    /// <summary>
    /// A handler that runs the real convert spec on whatever the tool sends,
    /// records the normalized blob, and answers like the real queue would.
    /// </summary>
    private sealed class SpecCallingHandler
    {
        public Mock<ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested>> Mock { get; } = new();

        public string? Normalized { get; private set; }

        public SpecCallingHandler()
        {
            Mock.Setup(h => h.Handle(
                    It.IsAny<RequestBlenderOperationCommand>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((RequestBlenderOperationCommand command, CancellationToken _) =>
                {
                    var normalized = BlenderOperationSpecs.NormalizeParameters(
                        command.Operation, command.ParametersJson);
                    if (normalized.IsFailure)
                    {
                        return Result.Failure<BlenderOperationRequested>(normalized.Error);
                    }

                    Normalized = normalized.Value;
                    return Result.Success(new BlenderOperationRequested(
                        7, command.Operation, command.ModelId, 5, AlreadyQueued: false));
                });
        }
    }

    [Fact]
    public async Task ConvertModel_BakeForWeb_Reaches_The_Convert_Spec()
    {
        var handler = new SpecCallingHandler();

        var result = await BlenderWriteMcpTools.ConvertModel(
            handler.Mock.Object, ClaimGranted().Object, Caller(),
            42, "glb", "key-1", bakeForWeb: true);

        Assert.Contains("\"status\":\"queued\"", Json(result));
        Assert.NotNull(handler.Normalized);

        using var normalized = JsonDocument.Parse(handler.Normalized!);
        Assert.Equal("glb", normalized.RootElement.GetProperty("format").GetString());
        Assert.True(normalized.RootElement.GetProperty("bake").GetBoolean());
        // The stored blob is what the dedup comparison reads, and the flag is
        // what tells a baked conversion apart from a plain one.
        Assert.Equal("glb baked for web", BlenderOperationSpecs.ConvertTarget(handler.Normalized));
    }

    [Fact]
    public async Task ConvertModel_BakeForWeb_Into_Stl_Is_Refused_By_The_Convert_Spec()
    {
        var handler = new SpecCallingHandler();

        var result = await BlenderWriteMcpTools.ConvertModel(
            handler.Mock.Object, ClaimGranted().Object, Caller(),
            42, "stl", "key-1", bakeForWeb: true);

        var json = Json(result);
        Assert.Contains("Blender.InvalidParameters", json);
        Assert.Contains("geometry only", json);
        // A refusal, not a queued job: no id to poll for a bake that would have
        // been dropped on the way out.
        Assert.DoesNotContain("jobId", json);
        Assert.Null(handler.Normalized);
    }
}
