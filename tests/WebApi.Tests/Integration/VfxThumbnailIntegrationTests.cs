using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The whole animated-thumbnail path against real Postgres and the real endpoints: creating
/// an effect queues its render (the unique job index and the new column are the parts a
/// mocked test cannot see), the worker's upload makes the thumbnail servable, and an edit
/// re-queues the same job instead of adding a second row.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class VfxThumbnailIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private static readonly byte[] WebpBytes = "RIFF\0\0\0\0WEBPVP8 vfx-thumbnail"u8.ToArray();

    private readonly ModelibrWebFactory _factory;
    private readonly HttpClient _client;

    public VfxThumbnailIntegrationTests(ModelibrWebFactory factory)
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

    private async Task<int> CreateVfxAsync(string name)
    {
        var response = await _client.PostAsJsonAsync("/vfx", new { name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, body.GetProperty("thumbnailUrl").ValueKind);
        return body.GetProperty("id").GetInt32();
    }

    private async Task<HttpResponseMessage> UploadAsync(int vfxId, byte[] bytes, string contentType)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        form.Add(file, "file", "thumbnail.webp");
        return await _client.PostAsync($"/vfx/{vfxId}/thumbnail/upload", form);
    }

    private async Task<(ThumbnailJobStatus Status, int Count)> JobAsync(int vfxId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var jobs = await db.ThumbnailJobs.AsNoTracking().Where(j => j.VfxId == vfxId).ToListAsync();
        Assert.All(jobs, j => Assert.Equal("Vfx", j.AssetType));
        return (jobs.Single().Status, jobs.Count);
    }

    [Fact]
    public async Task CreatingAnEffect_QueuesItsThumbnailRender()
    {
        var id = await CreateVfxAsync("Queued on create");

        var (status, count) = await JobAsync(id);
        Assert.Equal(ThumbnailJobStatus.Pending, status);
        Assert.Equal(1, count);

        var file = await _client.GetAsync($"/vfx/{id}/thumbnail/file");
        Assert.Equal(HttpStatusCode.NotFound, file.StatusCode);
    }

    [Fact]
    public async Task UploadedThumbnail_IsServedAsWebpAndAppearsOnTheListAndDetail()
    {
        var id = await CreateVfxAsync("Served");

        var upload = await UploadAsync(id, WebpBytes, "image/webp");
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);

        var detail = await _client.GetFromJsonAsync<JsonElement>($"/vfx/{id}");
        var url = detail.GetProperty("thumbnailUrl").GetString();
        Assert.StartsWith($"/vfx/{id}/thumbnail/file?v=", url);

        var list = await _client.GetFromJsonAsync<JsonElement>("/vfx");
        var listed = list.EnumerateArray().Single(v => v.GetProperty("id").GetInt32() == id);
        Assert.Equal(url, listed.GetProperty("thumbnailUrl").GetString());

        var served = await _client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType?.MediaType);
        Assert.Equal(WebpBytes, await served.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Upload_OfSomethingThatIsNotWebp_IsRejected()
    {
        var id = await CreateVfxAsync("Rejects html");

        var upload = await UploadAsync(id, "<html></html>"u8.ToArray(), "text/html");

        Assert.Equal(HttpStatusCode.BadRequest, upload.StatusCode);
        var detail = await _client.GetFromJsonAsync<JsonElement>($"/vfx/{id}");
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("thumbnailUrl").ValueKind);
    }

    // Regression: the unique VfxId index means a second Add would 500 the update. An edit
    // must put the one existing job back in the queue and keep the old picture showing.
    [Fact]
    public async Task EditingTheDefinition_RequeuesTheSameJobAndKeepsTheOldThumbnailUntilReplaced()
    {
        var id = await CreateVfxAsync("Edited");
        await UploadAsync(id, WebpBytes, "image/webp");
        var finish = await _client.PostAsJsonAsync($"/thumbnail-jobs/vfx/{await JobIdAsync(id)}/finish", new { success = true });
        Assert.Equal(HttpStatusCode.OK, finish.StatusCode);
        Assert.Equal(ThumbnailJobStatus.Done, (await JobAsync(id)).Status);

        var update = await _client.PutAsJsonAsync($"/vfx/{id}", new
        {
            definition = new { version = 1, duration = 3, loop = true, components = Array.Empty<object>() },
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var (status, count) = await JobAsync(id);
        Assert.Equal(ThumbnailJobStatus.Pending, status);
        Assert.Equal(1, count);
        var updated = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEqual(JsonValueKind.Null, updated.GetProperty("thumbnailUrl").ValueKind);
    }

    [Fact]
    public async Task DeletingAnEffect_RemovesItsJob()
    {
        var id = await CreateVfxAsync("Deleted");

        var delete = await _client.DeleteAsync($"/vfx/{id}");
        Assert.Equal(HttpStatusCode.OK, delete.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await db.ThumbnailJobs.AnyAsync(j => j.VfxId == id));
    }

    // The backfill must queue effects only: the maintainer keeps model regeneration
    // out of it, so a job for any other asset type here would be a regression.
    [Fact]
    public async Task RegenerateAll_QueuesJobsForEffectsAndCreatesNoneForModels()
    {
        var id = await CreateVfxAsync("Backfilled");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            db.Models.Add(Domain.Models.Model.Create("Untouched model", DateTime.UtcNow));
            await db.SaveChangesAsync();
            var job = await db.ThumbnailJobs.SingleAsync(j => j.VfxId == id);
            job.TryClaim("w", DateTime.UtcNow);
            job.MarkAsCompleted(DateTime.UtcNow);
            await db.SaveChangesAsync();
        }
        int before;
        using (var scope = _factory.Services.CreateScope())
        {
            before = await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>()
                .ThumbnailJobs.CountAsync(j => j.AssetType != "Vfx");
        }

        var response = await _client.PostAsync("/vfx/thumbnails/regenerate", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(ThumbnailJobStatus.Pending, (await JobAsync(id)).Status);
        using var verify = _factory.Services.CreateScope();
        var after = await verify.ServiceProvider.GetRequiredService<ApplicationDbContext>()
            .ThumbnailJobs.CountAsync(j => j.AssetType != "Vfx");
        Assert.Equal(before, after);

        var single = await _client.PostAsync($"/vfx/{id}/thumbnail/regenerate", null);
        Assert.Equal(HttpStatusCode.OK, single.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.PostAsync("/vfx/999999/thumbnail/regenerate", null)).StatusCode);
    }

    private async Task<int> JobIdAsync(int vfxId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.ThumbnailJobs.AsNoTracking().Where(j => j.VfxId == vfxId).Select(j => j.Id).SingleAsync();
    }
}
