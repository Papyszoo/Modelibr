using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
public class SearchEndpointBindingIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;
    private readonly HttpClient _client;

    public SearchEndpointBindingIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    // Idempotent re-migrate before any fact runs - the same defence every other class in
    // this collection carries (see the note in ConcurrencyTests). Each class's
    // ModelibrWebFactory constructor drops and recreates the shared
    // "Modelibr_IntegrationTests" database, and a sibling's drop can still land while this
    // class's host is starting; Program.cs deliberately swallows a startup migration that
    // hits that window so the app can boot without a database. Both facts below then read
    // repositories that need the schema, and failed with Npgsql 42P01 ("relation Projects
    // does not exist") - a 500 instead of the 400 under test.
    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

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
