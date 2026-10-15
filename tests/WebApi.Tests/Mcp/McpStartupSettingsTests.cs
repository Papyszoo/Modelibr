using Microsoft.AspNetCore.Builder;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Pins the one framework behaviour the MCP startup resolution depends on:
/// Program.cs writes the *effective* MCP flags back into
/// <c>builder.Configuration</c>, because the destructive guard reads the flag
/// per call. If ConfigurationManager's indexer setter stopped taking effect,
/// a stored "allow destructive tools" would silently not apply - this test
/// fails loudly instead.
/// </summary>
public class McpStartupSettingsTests
{
    [Fact]
    public void EffectiveMcpFlags_CanBeWrittenBackIntoConfiguration()
    {
        var builder = WebApplication.CreateBuilder();

        builder.Configuration["MCP_DESTRUCTIVE_ENABLED"] = "true";
        Assert.Equal("true", builder.Configuration["MCP_DESTRUCTIVE_ENABLED"]);

        builder.Configuration["MCP_DESTRUCTIVE_ENABLED"] = "false";
        Assert.Equal("false", builder.Configuration["MCP_DESTRUCTIVE_ENABLED"]);
    }
}
