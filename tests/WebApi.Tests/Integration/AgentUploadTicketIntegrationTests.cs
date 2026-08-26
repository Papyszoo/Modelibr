using System.Net;
using System.Net.Http.Headers;
using Application.Abstractions.Services;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebApi.Infrastructure;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The remote data plane, audited (prompt 02 part B).
///
/// A remote agent cannot hand a write tool a server-readable path, so the tool hands back
/// upload endpoints instead - and every byte then arrived as an anonymous multipart POST
/// with no audit entry and no idempotency, the two guarantees the co-located path
/// advertises. These tests drive the real HTTP endpoint with a real ticket and assert the
/// gap is closed: the upload is recorded, attributed, and apply-once.
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class AgentUploadTicketIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public AgentUploadTicketIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    private async Task MigrateAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    private async Task<string> IssueTicketAsync(string key, string? actor = null, string? batchId = null)
    {
        using var scope = _factory.Services.CreateScope();
        var tickets = scope.ServiceProvider.GetRequiredService<IAgentUploadTickets>();
        var grant = await tickets.IssueAsync(key, "import-model", "Model", actor, batchId);
        return grant.Secret;
    }

    /// <summary>A minimal .glb the import pipeline accepts, posted as multipart like an agent would.</summary>
    private static MultipartFormDataContent ModelUpload(string fileName)
    {
        // 12-byte glTF binary header: magic "glTF", version 2, total length.
        var bytes = new byte[]
        {
            0x67, 0x6C, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00,
        };

        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("model/gltf-binary");

        var content = new MultipartFormDataContent { { file, "file", fileName } };
        return content;
    }

    [Fact]
    public async Task A_Ticketed_Upload_Is_Recorded_In_The_Agent_Audit_Log()
    {
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var key = $"ticket-upload-{suffix}";
        var ticket = await IssueTicketAsync(key, actor: "curator", batchId: $"batch-{suffix}");

        var client = _factory.CreateClient();
        using var content = ModelUpload($"ticketed-{suffix}.glb");
        content.Headers.Add(AgentUploadTicketFilter.TicketHeader, ticket);

        var response = await client.PostAsync("/models", content);

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var log = await context.AgentOperationLogs.SingleAsync(l => l.IdempotencyKey == key);

        Assert.Equal(AgentOperationStatus.Completed, log.Status);
        Assert.Equal("import-model", log.Operation);
        Assert.Equal("Model", log.AssetType);
        // Attribution and batch travel with the ticket, so a remote import is reviewable
        // and reversible exactly like a co-located one.
        Assert.Equal("curator", log.Actor);
        Assert.Equal($"batch-{suffix}", log.BatchId);
        Assert.NotNull(log.AssetId);
    }

    [Fact]
    public async Task Replaying_A_Spent_Ticket_Neither_Imports_Again_Nor_Succeeds()
    {
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var key = $"ticket-replay-{suffix}";
        var ticket = await IssueTicketAsync(key);
        var client = _factory.CreateClient();

        using (var first = ModelUpload($"replay-{suffix}.glb"))
        {
            first.Headers.Add(AgentUploadTicketFilter.TicketHeader, ticket);
            var response = await client.PostAsync("/models", first);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }

        using (var second = ModelUpload($"replay-{suffix}.glb"))
        {
            second.Headers.Add(AgentUploadTicketFilter.TicketHeader, ticket);
            var response = await client.PostAsync("/models", second);

            // Single use: the ticket is spent, so the replay is refused outright rather
            // than being allowed through to the import pipeline a second time.
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Contains("InvalidUploadTicket", await response.Content.ReadAsStringAsync());
        }

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.Single(await context.AgentOperationLogs.Where(l => l.IdempotencyKey == key).ToListAsync());
    }

    [Fact]
    public async Task A_Second_Ticket_On_A_Completed_Key_Is_Answered_Already_Applied()
    {
        // The retry an agent actually makes when it never saw the first response: a fresh
        // ticket, the same idempotency key. The claim is what de-duplicates, not the ticket.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var key = $"ticket-retry-{suffix}";
        var client = _factory.CreateClient();

        using (var first = ModelUpload($"retry-{suffix}.glb"))
        {
            first.Headers.Add(AgentUploadTicketFilter.TicketHeader, await IssueTicketAsync(key));
            var response = await client.PostAsync("/models", first);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }

        using (var retry = ModelUpload($"retry-{suffix}.glb"))
        {
            retry.Headers.Add(AgentUploadTicketFilter.TicketHeader, await IssueTicketAsync(key));
            var response = await client.PostAsync("/models", retry);

            Assert.True(response.IsSuccessStatusCode);
            Assert.Contains("already-applied", await response.Content.ReadAsStringAsync());
        }

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.Single(await context.AgentOperationLogs.Where(l => l.IdempotencyKey == key).ToListAsync());
    }

    [Fact]
    public async Task An_Unknown_Ticket_Is_Rejected_Before_Anything_Is_Imported()
    {
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = _factory.CreateClient();

        using var content = ModelUpload($"forged-{suffix}.glb");
        content.Headers.Add(AgentUploadTicketFilter.TicketHeader, "not-a-real-ticket");

        var response = await client.PostAsync("/models", content);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_Upload_Without_A_Ticket_Is_Untouched()
    {
        // The UI and anyone using the API directly must not notice this filter exists.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var client = _factory.CreateClient();

        using var content = ModelUpload($"plain-{suffix}.glb");
        var response = await client.PostAsync("/models", content);

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await context.AgentOperationLogs.AnyAsync(l => l.Operation == "import-model" && l.Actor == null && l.BatchId == null && l.AssetId == null));
    }

    [Fact]
    public async Task A_Rejected_Upload_Releases_Both_The_Claim_And_The_Ticket()
    {
        // A 4xx must not burn the key: the agent fixes its request and retries with the
        // same ticket, rather than being told the import already happened.
        await MigrateAsync();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var key = $"ticket-reject-{suffix}";
        var ticket = await IssueTicketAsync(key);
        var client = _factory.CreateClient();

        using (var empty = new MultipartFormDataContent())
        {
            empty.Headers.Add(AgentUploadTicketFilter.TicketHeader, ticket);
            var response = await client.PostAsync("/models", empty);
            Assert.False(response.IsSuccessStatusCode);
        }

        using (var fixedUp = ModelUpload($"fixed-{suffix}.glb"))
        {
            fixedUp.Headers.Add(AgentUploadTicketFilter.TicketHeader, ticket);
            var response = await client.PostAsync("/models", fixedUp);

            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var log = await context.AgentOperationLogs.SingleAsync(l => l.IdempotencyKey == key);
        Assert.Equal(AgentOperationStatus.Completed, log.Status);
    }
}
