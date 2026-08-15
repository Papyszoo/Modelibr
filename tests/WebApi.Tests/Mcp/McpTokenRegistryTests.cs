using Microsoft.Extensions.Configuration;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// Per-token scoping for the MCP surface. The behaviour that matters most here is what
/// happens when the configuration is wrong: a typo that silently left the endpoint
/// unguarded would be worse than no token support at all, so every malformed entry fails
/// startup rather than being skipped.
/// </summary>
public class McpTokenRegistryTests
{
    private static McpTokenRegistry Registry(string? tokens)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["MCP_TOKENS"] = tokens })
            .Build();

        return McpTokenRegistry.FromConfiguration(configuration);
    }

    [Fact]
    public void No_Tokens_Configured_Leaves_The_Server_Unauthenticated_As_Before()
    {
        // Modelibr has no authentication by design; configuring MCP_TOKENS is what turns
        // identity on. An empty setting must not start rejecting the local agent.
        var registry = Registry(null);

        Assert.False(registry.Enforced);
        Assert.Same(McpPrincipal.Unscoped, registry.Resolve(null));
        Assert.Same(McpPrincipal.Unscoped, registry.Resolve("anything"));
    }

    [Fact]
    public void A_Configured_Secret_Resolves_To_Its_Named_Principal_And_Scopes()
    {
        var registry = Registry("curator:read,write:SECRET");

        var principal = registry.Resolve("SECRET");

        Assert.NotNull(principal);
        Assert.Equal("curator", principal!.Name);
        Assert.True(principal.Has(McpScope.Read));
        Assert.True(principal.Has(McpScope.Write));
        Assert.False(principal.Has(McpScope.Destructive));
    }

    [Fact]
    public void An_Unknown_Or_Missing_Secret_Resolves_To_Nothing_Once_Tokens_Exist()
    {
        var registry = Registry("curator:read,write:SECRET");

        Assert.True(registry.Enforced);
        Assert.Null(registry.Resolve("WRONG"));
        Assert.Null(registry.Resolve(null));
        Assert.Null(registry.Resolve(""));
    }

    [Fact]
    public void Write_Implies_Read_Because_A_Token_Cannot_Change_What_It_Cannot_Inspect()
    {
        var registry = Registry("importer:write:SECRET");

        var principal = registry.Resolve("SECRET");

        Assert.True(principal!.Has(McpScope.Read));
        Assert.True(principal.Has(McpScope.Write));
    }

    [Fact]
    public void Several_Tokens_Are_Resolved_Independently()
    {
        var registry = Registry("curator:read,write:ONE;janitor:read,write,destructive:TWO");

        Assert.Equal("curator", registry.Resolve("ONE")!.Name);
        Assert.Equal("janitor", registry.Resolve("TWO")!.Name);
        Assert.False(registry.Resolve("ONE")!.Has(McpScope.Destructive));
        Assert.True(registry.Resolve("TWO")!.Has(McpScope.Destructive));
    }

    [Fact]
    public void A_Secret_Containing_A_Colon_Still_Parses()
    {
        // Only the first two separators are structural, so a generated secret is not
        // quietly truncated into a token that never matches.
        var registry = Registry("curator:read:aa:bb:cc");

        Assert.Equal("curator", registry.Resolve("aa:bb:cc")!.Name);
    }

    [Theory]
    [InlineData("curator:read")]                    // no secret field at all
    [InlineData("curator:read:")]                   // empty secret
    [InlineData(":read:SECRET")]                    // no name to attribute writes to
    [InlineData("curator:admin:SECRET")]            // unknown scope
    [InlineData("curator::SECRET")]                 // no scopes, so the token can do nothing
    [InlineData("curator:read:ONE;curator:write:TWO")] // duplicate name - ambiguous in the audit log
    public void A_Malformed_Entry_Fails_Startup_Instead_Of_Being_Skipped(string tokens)
    {
        Assert.Throws<InvalidOperationException>(() => Registry(tokens));
    }

    [Fact]
    public void A_Malformed_Entry_Keeps_Its_Secret_Out_Of_The_Error_Message()
    {
        // A missing scopes field makes the third part look like a secret. The exception
        // reaches startup logs, so it names the entry and redacts everything after it.
        var thrown = Assert.Throws<InvalidOperationException>(() => Registry("curator:SECRET-oops"));

        Assert.Contains("curator", thrown.Message);
        Assert.DoesNotContain("SECRET-oops", thrown.Message);
    }
}
