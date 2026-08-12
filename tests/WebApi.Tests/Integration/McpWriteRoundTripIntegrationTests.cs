using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Extraction.Jobs;
using Application.Packs;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// Prompt 30 definition of done for the write surface: an MCP write tool, invoked as a
/// pure pass-through to the real command handlers backed by PostgreSQL, actually mutates
/// the library, records the mutation in <see cref="AgentOperationLog"/>, and a retry
/// carrying the same idempotency key is a no-op. Unit tests cover this with mocked
/// handlers; this proves it against the real handlers + <see cref="IAgentAudit"/> + the
/// DB (where the idempotency short-circuit and audit persistence genuinely happen).
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class McpWriteRoundTripIntegrationTests : IClassFixture<ModelibrWebFactory>
{
    private readonly ModelibrWebFactory _factory;

    public McpWriteRoundTripIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    private async Task MigrateAsync()
    {
        using var scope = _factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    [Fact]
    public async Task CreatePack_Mutates_Records_Audit_And_Is_Idempotent_On_Retry()
    {
        await MigrateAsync();
        const string key = "mcp-write-create-pack-1";
        const string packName = "Agent-Created Pack";

        // First invocation: the write goes through the real handler and creates a pack.
        int packId;
        using (var scope = _factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var result = await AssetWriteMcpTools.CreatePack(
                sp.GetRequiredService<ICommandHandler<CreatePackCommand, CreatePackResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                packName,
                key);

            var json = System.Text.Json.JsonSerializer.Serialize(result);
            Assert.Contains("\"ok\"", json);

            var pack = await sp.GetRequiredService<ApplicationDbContext>().Packs
                .SingleAsync(p => p.Name == packName);
            packId = pack.Id;
        }

        // Audit row was written for the operation, keyed by the idempotency key.
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var logs = await context.AgentOperationLogs.Where(l => l.IdempotencyKey == key).ToListAsync();
            var log = Assert.Single(logs);
            Assert.Equal("create-pack", log.Operation);
            Assert.Equal("Pack", log.AssetType);
            Assert.Equal(packId, log.AssetId);
        }

        // Retry with the SAME key: detected up-front, no second pack, no second audit row.
        using (var scope = _factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var retry = await AssetWriteMcpTools.CreatePack(
                sp.GetRequiredService<ICommandHandler<CreatePackCommand, CreatePackResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                packName,
                key);

            Assert.Contains("already-applied", System.Text.Json.JsonSerializer.Serialize(retry));

            var context = sp.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(1, await context.Packs.CountAsync(p => p.Name == packName));
            Assert.Equal(1, await context.AgentOperationLogs.CountAsync(l => l.IdempotencyKey == key));
        }
    }

    [Fact]
    public async Task CreatePack_Concurrent_Calls_With_One_Key_Create_Exactly_One_Pack()
    {
        // Regression (found driving a real 1,700-model MCP import): idempotency used to be
        // a lookup followed by a write. Two in-flight calls sharing a key BOTH passed the
        // lookup, BOTH created a pack, and the loser then tripped the audit log's unique
        // index - leaving a duplicate pack with no audit row and an opaque tool error.
        // The sequential retry test above cannot see this; only concurrency can.
        await MigrateAsync();
        const string key = "mcp-write-create-pack-concurrent-1";
        const string packName = "Concurrently Created Pack";

        async Task<string> InvokeAsync()
        {
            using var scope = _factory.Services.CreateScope();
            var sp = scope.ServiceProvider;
            var result = await AssetWriteMcpTools.CreatePack(
                sp.GetRequiredService<ICommandHandler<CreatePackCommand, CreatePackResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                packName,
                key);
            return System.Text.Json.JsonSerializer.Serialize(result);
        }

        var responses = await Task.WhenAll(InvokeAsync(), InvokeAsync(), InvokeAsync(), InvokeAsync());

        // Every caller gets a well-formed answer - exactly one applied, the rest stood down.
        Assert.Equal(1, responses.Count(r => r.Contains("\"ok\"")));
        // A loser sees "already-applied" if the winner had already completed its claim, and
        // "in-progress" if the claim was still live. Which of the two is a timing detail;
        // standing down without re-applying is the contract.
        Assert.Equal(3, responses.Count(r => r.Contains("already-applied") || r.Contains("in-progress")));

        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(1, await context.Packs.CountAsync(p => p.Name == packName));
            Assert.Equal(1, await context.AgentOperationLogs.CountAsync(l => l.IdempotencyKey == key));
        }
    }

    [Fact]
    public async Task TriggerRederive_Enqueues_Job_Records_Audit_And_Retry_Reuses_The_Job()
    {
        await MigrateAsync();
        const string key = "mcp-write-rederive-1";
        const int assetId = 91001;

        int jobId;
        using (var scope = _factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var result = await AssetWriteMcpTools.TriggerRederive(
                sp.GetRequiredService<ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                "Model",
                assetId,
                key,
                versionId: 1);

            var json = System.Text.Json.JsonSerializer.Serialize(result);
            Assert.Contains("\"ok\"", json);

            var job = await sp.GetRequiredService<ApplicationDbContext>().ExtractionJobs
                .SingleAsync(j => j.AssetType == "Model" && j.AssetId == assetId);
            jobId = job.Id;

            var log = await sp.GetRequiredService<ApplicationDbContext>().AgentOperationLogs
                .SingleAsync(l => l.IdempotencyKey == key);
            Assert.Equal("trigger-rederive", log.Operation);
            Assert.Equal(jobId, job.Id);
        }

        // Retry with the same idempotency key short-circuits: still one job, one audit row.
        using (var scope = _factory.Services.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var retry = await AssetWriteMcpTools.TriggerRederive(
                sp.GetRequiredService<ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>>(),
                sp.GetRequiredService<IAgentAudit>(),
                "Model",
                assetId,
                key,
                versionId: 1);

            Assert.Contains("already-applied", System.Text.Json.JsonSerializer.Serialize(retry));

            var context = sp.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(1, await context.ExtractionJobs.CountAsync(j => j.AssetType == "Model" && j.AssetId == assetId));
            Assert.Equal(1, await context.AgentOperationLogs.CountAsync(l => l.IdempotencyKey == key));
        }
    }
}
