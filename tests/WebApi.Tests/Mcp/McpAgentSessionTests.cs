using System.ComponentModel;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Search;
using Microsoft.AspNetCore.Http;
using ModelContextProtocol.Server;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// What an agent route enforces: only its tools are listed (a call to any other is refused
/// by the server because the tool is not there), and a family-scoped agent cannot read
/// outside its families.
/// </summary>
public class McpAgentSessionTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static readonly Dictionary<string, string> KnownTools = new()
    {
        ["search_assets"] = "Search the library.",
        ["get_asset"] = "Read one asset.",
        ["create_material"] = "Create a material.",
    };

    private const string StylistJson = """
        [
          {
            "name": "stylist",
            "description": "Dresses models.",
            "main": true,
            "families": ["Model", "TextureSet"],
            "tools": ["search_assets", "get_asset"]
          }
        ]
        """;

    private static McpAgentDefinition Stylist() =>
        McpAgentRegistry.Load(StylistJson, KnownTools, McpAgentRegistry.KnownFamilies).Find("stylist")!;

    private static McpAgentRegistry Registry() =>
        McpAgentRegistry.Load(StylistJson, KnownTools, McpAgentRegistry.KnownFamilies);

    [McpServerToolType]
    private static class TestTools
    {
        [McpServerTool(Name = "search_assets"), Description("search")]
        public static string SearchAssets() => "";

        [McpServerTool(Name = "get_asset"), Description("get")]
        public static string GetAsset() => "";

        [McpServerTool(Name = "create_material"), Description("create")]
        public static string CreateMaterial() => "";
    }

    private static McpServerOptions OptionsWithAllTools()
    {
        var collection = new McpServerPrimitiveCollection<McpServerTool>(StringComparer.Ordinal);
        foreach (var name in new[] { nameof(TestTools.SearchAssets), nameof(TestTools.GetAsset), nameof(TestTools.CreateMaterial) })
        {
            collection.Add(McpServerTool.Create(typeof(TestTools).GetMethod(name)!));
        }

        return new McpServerOptions { ToolCollection = collection };
    }

    [Fact]
    public void Restricting_A_Session_Leaves_Only_The_Agents_Tools()
    {
        var options = OptionsWithAllTools();

        McpAgentRegistry.RestrictTools(options, Stylist());

        Assert.Equal(2, options.ToolCollection!.Count);
        Assert.True(options.ToolCollection.TryGetPrimitive("search_assets", out _));
        Assert.True(options.ToolCollection.TryGetPrimitive("get_asset", out _));
        // A tool that is not in the collection is one the server refuses to call, so this
        // single removal covers both "lists only its tools" and "rejects the others".
        Assert.False(options.ToolCollection.TryGetPrimitive("create_material", out _));
    }

    [Fact]
    public async Task The_Agent_Filter_Records_The_Agent_For_The_Tools()
    {
        var registry = Registry();
        var context = new DefaultHttpContext();
        context.Request.RouteValues[McpAgentEndpointFilter.AgentRouteValue] = "stylist";
        var invocation = EndpointFilterInvocationContext.Create(context);

        var result = await new McpAgentEndpointFilter(registry)
            .InvokeAsync(invocation, _ => ValueTask.FromResult<object?>("next"));

        Assert.Equal("next", result);
        Assert.Same(registry.Find("stylist"), context.Items[McpCallerContext.AgentItemKey]);
    }

    [Fact]
    public async Task An_Unknown_Agent_Is_Rejected_With_404_Before_The_Session_Starts()
    {
        var registry = Registry();
        var context = new DefaultHttpContext();
        context.Request.RouteValues[McpAgentEndpointFilter.AgentRouteValue] = "nobody";
        var invocation = EndpointFilterInvocationContext.Create(context);
        var called = false;

        var result = await new McpAgentEndpointFilter(registry)
            .InvokeAsync(invocation, _ => { called = true; return ValueTask.FromResult<object?>("next"); });

        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode);
        Assert.False(called);
    }

    [Fact]
    public async Task A_Family_Scoped_Search_Outside_The_Agents_Families_Is_Refused()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        var caller = McpCallerContext.For(McpPrincipal.Unscoped, Stylist());

        var result = await AssetSearchMcpTools.SearchAssets(handler.Object, "oak", assetType: "Sound", caller: caller);

        Assert.Equal("AssetFamilyNotAllowed", JsonSerializer.SerializeToElement(result, JsonOptions).GetProperty("error").GetString());
        handler.Verify(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task A_Family_Scoped_Batch_Fails_Only_The_Entry_Outside_The_Agents_Families()
    {
        var handler = new Mock<IQueryHandler<AssetSearchQuery, AssetSearchResponse>>();
        handler.Setup(h => h.Handle(It.IsAny<AssetSearchQuery>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AssetSearchResponse(
                [new AssetSearchHit("TextureSet", 3, 4, null, "oak", "oak - 1 part", "primary", "name")], 1)));

        var caller = McpCallerContext.For(McpPrincipal.Unscoped, Stylist());

        var result = await AssetSearchMcpTools.SearchMany(
            handler.Object,
            [
                new AssetSearchMcpTools.SearchRequest("oak", "textures", AssetType: "TextureSet"),
                new AssetSearchMcpTools.SearchRequest("boom", "sounds", AssetType: "Sound"),
            ],
            caller: caller);

        var searches = JsonSerializer.SerializeToElement(result, JsonOptions).GetProperty("searches");
        Assert.Equal(1, searches[0].GetProperty("totalCount").GetInt32());
        Assert.Equal("AssetFamilyNotAllowed", searches[1].GetProperty("error").GetString());
    }
}
