using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The REST search endpoint must bind the newer filters the MCP path already supports.
///
/// <para>
/// GET /search/assets used to bind nine parameters, so a REST caller could not pass a
/// projectId or applyProfile at all - response.profile was always null. These assert the
/// profile-selecting parameters actually reach the handler: each of them, when it names
/// something that does not exist or is not a mode, produces a distinguishable failure only
/// the handler can raise. If the binding were missing the parameter would be ignored and the
/// request would succeed.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class SearchEndpointBindingIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly HttpClient _client;

    public SearchEndpointBindingIntegrationTests(ModelibrWebFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task ApplyProfile_Is_Bound_And_Rejects_An_Unknown_Mode()
    {
        var response = await _client.GetAsync("/search/assets?q=chair&applyProfile=banana");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("search.invalid_apply_profile", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task ProjectId_Is_Bound_And_Reports_A_Missing_Project()
    {
        var response = await _client.GetAsync("/search/assets?q=chair&projectId=987654");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("project.not_found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task SceneId_Is_Bound_And_Reports_A_Missing_Scene()
    {
        var response = await _client.GetAsync("/search/assets?q=chair&sceneId=987654");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("scene.not_found", body.GetProperty("error").GetString());
    }
}
