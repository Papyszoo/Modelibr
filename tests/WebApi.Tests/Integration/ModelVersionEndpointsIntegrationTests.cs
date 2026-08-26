using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Application.Models;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class ModelVersionEndpointsIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;
    private readonly HttpClient _client;

    public ModelVersionEndpointsIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task CreateModelVersion_WithoutSetAsActive_DefaultsToInactive()
    {
        int modelId;
        int v1Id;
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var model = Model.Create("Test Model Version Inactive", DateTime.UtcNow);
            context.Models.Add(model);
            await context.SaveChangesAsync();

            var v1 = model.CreateVersion(1, "v1", DateTime.UtcNow);
            v1.AddFile(Domain.Models.File.Create("v1.glb", "v1.glb", "uploads/v1.glb", "model/gltf-binary", Domain.ValueObjects.FileType.Glb, 10, new string('a', 64), DateTime.UtcNow));
            context.ModelVersions.Add(v1);
            await context.SaveChangesAsync();

            model.SetActiveVersion(v1.Id, DateTime.UtcNow);
            await context.SaveChangesAsync();

            modelId = model.Id;
            v1Id = v1.Id;
        }

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3, 4 });
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/octet-stream");
        form.Add(fileContent, "file", "v2.glb");

        var response = await _client.PostAsync($"/models/{modelId}/versions", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<CreateModelVersionResponse>();
        Assert.NotNull(result);

        using (var verifyScope = _factory.Services.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var model = await db.Models.Include(m => m.Versions).FirstAsync(m => m.Id == modelId);
            Assert.Equal(2, model.Versions.Count);
            // v1 remains active, v2 is inactive
            Assert.Equal(v1Id, model.ActiveVersionId);
        }
    }

    [Fact]
    public async Task CreateModelVersion_WithSetAsActiveTrue_SetsActiveVersion()
    {
        int modelId;
        int v1Id;
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var model = Model.Create("Test Model Version Active", DateTime.UtcNow);
            context.Models.Add(model);
            await context.SaveChangesAsync();

            var v1 = model.CreateVersion(1, "v1", DateTime.UtcNow);
            v1.AddFile(Domain.Models.File.Create("v1.glb", "v1.glb", "uploads/v1.glb", "model/gltf-binary", Domain.ValueObjects.FileType.Glb, 10, new string('a', 64), DateTime.UtcNow));
            context.ModelVersions.Add(v1);
            await context.SaveChangesAsync();

            model.SetActiveVersion(v1.Id, DateTime.UtcNow);
            await context.SaveChangesAsync();

            modelId = model.Id;
            v1Id = v1.Id;
        }

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(new byte[] { 5, 6, 7, 8 });
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/octet-stream");
        form.Add(fileContent, "file", "v2.glb");
        form.Add(new StringContent("v2 version"), "description");
        form.Add(new StringContent("true"), "setAsActive");

        var response = await _client.PostAsync($"/models/{modelId}/versions", form);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<CreateModelVersionResponse>();
        Assert.NotNull(result);

        using (var verifyScope = _factory.Services.CreateScope())
        {
            var db = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var model = await db.Models.Include(m => m.Versions).FirstAsync(m => m.Id == modelId);
            Assert.Equal(2, model.Versions.Count);
            // v2 becomes active
            Assert.Equal(result!.VersionId, model.ActiveVersionId);
            Assert.NotEqual(v1Id, model.ActiveVersionId);
            // Pins the multipart binding the asset-processor worker relies on: switching
            // these to [FromQuery] leaves setAsActive/description silently unbound.
            Assert.Equal("v2 version", model.Versions.Single(v => v.Id == result.VersionId).Description);
        }
    }
}
