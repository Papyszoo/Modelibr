using System.IO.Compression;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The material effects path against real Postgres and the real endpoints: the jsonb column
/// round-trips, the patch endpoint (PUT/PATCH) sets and clears the document, and the Godot
/// export serves the generated shader and resource as a zip.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class MaterialGodotExportIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;
    private readonly HttpClient _client;

    public MaterialGodotExportIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private static JsonElement Effects() => JsonSerializer.Deserialize<JsonElement>("""
        {"version":1,"effects":[
          {"type":"jelly_wobble","amplitude":0.03,"frequency":1.5,"waveScale":4.0,"seed":0},
          {"type":"rim","color":"#7CFF2A","power":3.0,"intensity":1.0}]}
        """);

    [Fact]
    public async Task ExportGodot_WithUnknownId_Returns404()
    {
        var response = await _client.GetAsync("/materials/999999/export/godot");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("MaterialNotFound", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task CreateWithEffects_ThenPatchClear_ThenExportGodot_RoundTrips()
    {
        var name = $"Glow Jelly {Guid.NewGuid():N}";
        var create = await _client.PostAsJsonAsync("/materials", new { name, effects = Effects() });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetInt32();

        // The detail read carries the document back as a JSON object.
        var detail = await _client.GetFromJsonAsync<JsonElement>($"/materials/{id}");
        Assert.Equal("jelly_wobble", detail.GetProperty("effects").GetProperty("effects")[0].GetProperty("type").GetString());

        // The export is a zip holding the generated shader and its ShaderMaterial.
        var export = await _client.GetAsync($"/materials/{id}/export/godot");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        Assert.Equal("application/zip", export.Content.Headers.ContentType?.MediaType);

        var shader = await ReadZipEntry(await export.Content.ReadAsStreamAsync(), entry =>
            entry.EndsWith(".gdshader", StringComparison.Ordinal));
        Assert.StartsWith("shader_type spatial;", shader);
        Assert.Contains("VERTEX += NORMAL * jelly_d;", shader);
        Assert.Contains("EMISSION += rim_color", shader);

        // A JSON null clears the document (the same patch endpoint answers PUT and PATCH),
        // and the next export leaves the jelly wobble out.
        var clear = await _client.PatchAsJsonAsync($"/materials/{id}", new { clearEffects = true });
        Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
        var cleared = await _client.GetFromJsonAsync<JsonElement>($"/materials/{id}");
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("effects").ValueKind);

        var exportAfterClear = await _client.GetAsync($"/materials/{id}/export/godot");
        var plainShader = await ReadZipEntry(await exportAfterClear.Content.ReadAsStreamAsync(), entry =>
            entry.EndsWith(".gdshader", StringComparison.Ordinal));
        Assert.DoesNotContain("VERTEX += NORMAL *", plainShader);
    }

    private static async Task<string> ReadZipEntry(Stream zipStream, Func<string, bool> select)
    {
        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);
        var entry = Assert.Single(zip.Entries, e => select(e.FullName));
        await using var stream = entry.Open();
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
    }
}
