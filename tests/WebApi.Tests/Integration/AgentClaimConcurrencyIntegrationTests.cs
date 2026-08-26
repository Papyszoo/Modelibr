using System.Text.Json;
using Application.Abstractions.Repositories;
using Application.Agents;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The idempotency claim's concurrency behaviour, against real PostgreSQL.
///
/// <para>
/// Every guarantee here is a conditional UPDATE whose WHERE clause names the state (and,
/// now, the generation) being left. A mock cannot show that those clauses match the rows
/// they are supposed to and no others, and EF Core's InMemory provider does not enforce
/// the unique index the claim insert races against - so the whole primitive is only
/// meaningfully testable here.
/// </para>
/// </summary>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class AgentClaimConcurrencyIntegrationTests : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private const int LeaseMinutes = 15;

    private readonly ModelibrWebFactory _factory;

    public AgentClaimConcurrencyIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await context.Database.MigrateAsync();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>
    /// Crash after the mutation, before the completion. The window is small and real: the
    /// write commits, then the entry is marked Completed. A claim still Pending when its
    /// owner died may sit on either side of it, and nothing recorded which.
    /// </summary>
    [Fact]
    public async Task A_Claim_Whose_Owner_Died_Mid_Write_Is_Reported_Interrupted_And_Never_Handed_Over()
    {
        var key = Key();
        var start = DateTime.UtcNow;

        // The first caller claims and then vanishes - no Complete, no Abandon.
        var first = await ClaimAsync(key, start);
        Assert.True(first.Owned);

        // Long enough later that the lease has lapsed.
        var later = start.AddMinutes(LeaseMinutes + 1);
        var second = await ClaimAsync(key, later);

        Assert.False(second.Owned);
        Assert.True(second.Interrupted);
        Assert.Null(second.ClaimToken);
    }

    [Fact]
    public async Task An_Interrupted_Key_Answers_The_Same_To_Every_Later_Retry()
    {
        // The property that makes the state worth having. Releasing it into Failed after
        // one report would only move the duplicate to the next call - and that call is the
        // one nobody is watching.
        var key = Key();
        var start = DateTime.UtcNow;
        await ClaimAsync(key, start);

        var later = start.AddMinutes(LeaseMinutes + 1);
        var first = await ClaimAsync(key, later);
        var second = await ClaimAsync(key, later.AddMinutes(30));
        var third = await ClaimAsync(key, later.AddHours(6));

        Assert.True(first.Interrupted);
        Assert.True(second.Interrupted);
        Assert.True(third.Interrupted);
        Assert.All(new[] { first, second, third }, t => Assert.False(t.Owned));

        var stored = await FindAsync(key);
        Assert.Equal(AgentOperationStatus.Interrupted, stored!.Status);
    }

    /// <summary>
    /// The other half: a failure that is <b>known</b> to have happened before the mutation
    /// stays retryable, because that is what a retry is for. Losing this would make every
    /// transient error burn its key.
    /// </summary>
    [Fact]
    public async Task A_Known_Pre_Mutation_Failure_Is_Taken_Over_By_The_Next_Retry()
    {
        var key = Key();
        var start = DateTime.UtcNow;

        var first = await ClaimAsync(key, start);
        Assert.True(first.Owned);
        // The guard's failure path: the write returned an error, so the claim is released
        // deliberately by a caller that knows nothing landed.
        Assert.True(await FailAsync(key, first.ClaimToken!, start));

        var retry = await ClaimAsync(key, start.AddSeconds(1));

        Assert.True(retry.Owned);
        Assert.False(retry.Interrupted);
        // A new generation, so the first caller can no longer settle it.
        Assert.NotEqual(first.ClaimToken, retry.ClaimToken);
    }

    [Fact]
    public async Task A_Stale_Owner_Cannot_Complete_Or_Abandon_The_Claim_That_Replaced_It()
    {
        var key = Key();
        var start = DateTime.UtcNow;

        var stale = await ClaimAsync(key, start);
        Assert.True(await FailAsync(key, stale.ClaimToken!, start));
        var current = await ClaimAsync(key, start.AddSeconds(1));
        Assert.True(current.Owned);

        // The stale owner wakes up and tries to settle "its" key both ways.
        Assert.False(await CompleteAsync(key, stale.ClaimToken!, start.AddSeconds(2)));
        Assert.False(await FailAsync(key, stale.ClaimToken!, start.AddSeconds(3)));

        // The live claim is untouched - still Pending, still owned by the current caller.
        var stored = await FindAsync(key);
        Assert.Equal(AgentOperationStatus.Pending, stored!.Status);
        Assert.Equal(current.ClaimToken, stored.ClaimToken);

        // And the current owner can still settle it.
        Assert.True(await CompleteAsync(key, current.ClaimToken!, start.AddSeconds(4)));
        Assert.Equal(AgentOperationStatus.Completed, (await FindAsync(key))!.Status);
    }

    [Fact]
    public async Task Only_One_Of_Two_Simultaneous_Claims_On_One_Key_Owns_It()
    {
        // The original race: with a lookup-then-write check both callers passed and both
        // applied. The insert is the arbiter, and the loser is told the claim is in flight.
        var key = Key();
        var now = DateTime.UtcNow;

        var results = await Task.WhenAll(ClaimAsync(key, now), ClaimAsync(key, now));

        Assert.Equal(1, results.Count(r => r.Owned));
        var loser = results.Single(r => !r.Owned);
        Assert.False(loser.Interrupted);
        Assert.Equal(AgentOperationStatus.Pending, loser.Existing!.Status);
    }

    [Fact]
    public async Task An_Interrupted_Settle_Is_Terminal_And_Only_The_Owner_Can_Write_It()
    {
        // The settle a call makes for itself when it cannot say whether its mutation
        // committed. Same ownership rule as failing a claim; the state it lands in is the
        // one no retry gets out of.
        var key = Key();
        var now = DateTime.UtcNow;
        var claim = await ClaimAsync(key, now);

        // A caller holding some other generation cannot burn this key.
        Assert.False(await InterruptAsync(key, "not-the-token", now));
        Assert.Equal(AgentOperationStatus.Pending, (await FindAsync(key))!.Status);

        Assert.True(await InterruptAsync(key, claim.ClaimToken!, now, assetType: "Pack", assetId: 42));

        var stored = await FindAsync(key);
        Assert.Equal(AgentOperationStatus.Interrupted, stored!.Status);
        // What the lost call was working on is recorded, because it is all a person
        // recovering by hand has to go on.
        Assert.Equal("Pack", stored.AssetType);
        Assert.Equal(42, stored.AssetId);

        // And it stays that way, for this retry and every one after it.
        var retry = await ClaimAsync(key, now.AddHours(2));
        Assert.False(retry.Owned);
        Assert.True(retry.Interrupted);
    }

    [Fact]
    public async Task A_Guarded_Write_Whose_Completion_Was_Lost_Is_Never_Run_A_Second_Time()
    {
        // End to end, through the real audit and a real row: the body commits, the
        // completion fails, and every later call on that key is told so rather than
        // running the write again. This is the create_pack-becomes-two-packs case.
        var key = Key();
        var runs = 0;

        using (var scope = _factory.Services.CreateScope())
        {
            var audit = scope.ServiceProvider.GetRequiredService<IAgentAudit>();
            await Assert.ThrowsAsync<InvalidOperationException>(() => McpWriteGuard.Guarded(
                audit,
                McpCallerContext.Unauthenticated(),
                new AgentWrite(key, "create-pack"),
                _ =>
                {
                    runs++;
                    // Stands in for a command that committed and then blew up on the way out.
                    throw new InvalidOperationException("after-commit dispatch failed");
                },
                CancellationToken.None));
        }

        Assert.Equal(AgentOperationStatus.Interrupted, (await FindAsync(key))!.Status);

        // Three retries, exactly as an agent would make them.
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var scope = _factory.Services.CreateScope();
            var audit = scope.ServiceProvider.GetRequiredService<IAgentAudit>();
            var response = await McpWriteGuard.Guarded(
                audit,
                McpCallerContext.Unauthenticated(),
                new AgentWrite(key, "create-pack"),
                _ =>
                {
                    runs++;
                    return Task.FromResult(McpWriteGuard.Applied(new { ok = true }, "Pack", 1, new { }));
                },
                CancellationToken.None);

            Assert.Contains("\"interrupted\"", JsonSerializer.Serialize(response));
        }

        Assert.Equal(1, runs);
    }

    // ─── Reversal claims ─────────────────────────────────────────────

    [Fact]
    public async Task Only_One_Of_Two_Simultaneous_Reversals_Owns_The_Inverse()
    {
        // reverse_operation carries no idempotency key of its own, so nothing upstream
        // deduplicates two calls naming one entry. For an inverse that CREATES something -
        // recreating a deleted scene - both applying it leaves two of it.
        var key = await CompletedEntryAsync();

        var results = await Task.WhenAll(BeginReversalAsync(key), BeginReversalAsync(key));

        Assert.Equal(1, results.Count(r => r.IsOwned));
        Assert.Equal(
            ReversalClaimOutcome.InProgress,
            results.Single(r => !r.IsOwned).Outcome);
    }

    [Fact]
    public async Task A_Reversal_Claim_Released_After_A_Failed_Inverse_Can_Be_Taken_Again()
    {
        // The whole point of splitting the claim from the completed marker: an inverse that
        // did not apply must leave the operation undoable.
        var key = await CompletedEntryAsync();

        var first = await BeginReversalAsync(key);
        Assert.True(first.IsOwned);
        Assert.True(await ReleaseReversalAsync(key, first.Token!));

        var second = await BeginReversalAsync(key);

        Assert.True(second.IsOwned);
        Assert.Null((await FindAsync(key))!.ReversedAt);
    }

    [Fact]
    public async Task A_Reversal_Whose_Owner_Died_Is_Reported_Interrupted_Not_Retaken()
    {
        // Same reasoning as an interrupted write claim: the inverse may have committed
        // before the process died, and re-running it is not free.
        var key = await CompletedEntryAsync();

        var first = await BeginReversalAsync(key);
        Assert.True(first.IsOwned);

        // Nobody settles it, and the lease lapses.
        var second = await BeginReversalAsync(key, DateTime.UtcNow.AddHours(1));

        Assert.Equal(ReversalClaimOutcome.Interrupted, second.Outcome);
        Assert.Null(second.Token);
        // Neither reversed nor free - which is exactly the honest answer.
        Assert.Null((await FindAsync(key))!.ReversedAt);
    }

    [Fact]
    public async Task A_Stale_Reversal_Owner_Cannot_Record_A_Reversal_On_A_Newer_Claim()
    {
        var key = await CompletedEntryAsync();

        var stale = await BeginReversalAsync(key);
        Assert.True(await ReleaseReversalAsync(key, stale.Token!));
        var current = await BeginReversalAsync(key);
        Assert.True(current.IsOwned);

        Assert.False(await CompleteReversalAsync(key, stale.Token!));
        Assert.False(await ReleaseReversalAsync(key, stale.Token!));
        Assert.Null((await FindAsync(key))!.ReversedAt);

        Assert.True(await CompleteReversalAsync(key, current.Token!));
        Assert.NotNull((await FindAsync(key))!.ReversedAt);
    }

    [Fact]
    public async Task A_Reversal_Whose_Outcome_Is_Unknown_Answers_Interrupted_To_Every_Retry()
    {
        // The settle a caller makes for itself when its inverse threw, was cancelled, or
        // could not be recorded. It keeps the claim and expires it, which is the same state
        // a process that died mid-inverse leaves - so it reads as interrupted immediately
        // rather than pretending for a lease that somebody is still working on it.
        var key = await CompletedEntryAsync();
        var claim = await BeginReversalAsync(key);
        Assert.True(claim.IsOwned);

        // Only the caller holding the claim may do it.
        Assert.False(await ExpireReversalAsync(key, "not-the-token"));

        Assert.True(await ExpireReversalAsync(key, claim.Token!));

        foreach (var _ in Enumerable.Range(0, 3))
        {
            var retry = await BeginReversalAsync(key);
            Assert.Equal(ReversalClaimOutcome.Interrupted, retry.Outcome);
            Assert.Null(retry.Token);
        }

        // Neither reversed nor free, which is the only honest reading of an inverse whose
        // outcome nobody recorded.
        var stored = await FindAsync(key);
        Assert.Null(stored!.ReversedAt);
        Assert.NotNull(stored.ReversalToken);
    }

    [Fact]
    public async Task A_Completed_Reversal_Cannot_Be_Claimed_Again()
    {
        var key = await CompletedEntryAsync();

        var claim = await BeginReversalAsync(key);
        Assert.True(await CompleteReversalAsync(key, claim.Token!));

        var again = await BeginReversalAsync(key);

        Assert.Equal(ReversalClaimOutcome.AlreadyReversed, again.Outcome);
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private static string Key() => $"claim-test-{Guid.NewGuid():N}";

    /// <summary>A fresh entry that has been claimed and completed - i.e. one that can be reversed.</summary>
    private async Task<string> CompletedEntryAsync()
    {
        var key = Key();
        var now = DateTime.UtcNow;
        var claim = await ClaimAsync(key, now);
        Assert.True(await CompleteAsync(key, claim.ClaimToken!, now));
        return key;
    }

    private async Task<ClaimTakeover> ClaimAsync(string key, DateTime now)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        var claim = AgentOperationLog.Create(
            key, "create-pack", now, assetType: "Pack", claimedBy: Environment.MachineName);
        return await repository.TryClaimAsync(claim, LeaseMinutes, now);
    }

    private async Task<bool> CompleteAsync(string key, string token, DateTime now)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.CompleteClaimAsync(key, token, "Pack", 1, "{}", null, now);
    }

    private async Task<bool> InterruptAsync(
        string key, string token, DateTime now, string? assetType = null, int? assetId = null)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.InterruptClaimAsync(key, token, assetType, assetId, now);
    }

    private async Task<bool> FailAsync(string key, string token, DateTime now)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.FailClaimAsync(key, token, now);
    }

    private async Task<ReversalClaim> BeginReversalAsync(string key, DateTime? at = null)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.TryBeginReversalAsync(
            key, AgentOperationLog.NewToken(), leaseMinutes: 5, at ?? DateTime.UtcNow);
    }

    private async Task<bool> CompleteReversalAsync(string key, string token)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.CompleteReversalAsync(key, token, DateTime.UtcNow);
    }

    private async Task<bool> ReleaseReversalAsync(string key, string token)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.ReleaseReversalAsync(key, token);
    }

    private async Task<bool> ExpireReversalAsync(string key, string token)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.ExpireReversalClaimAsync(key, token, DateTime.UtcNow.AddHours(-1));
    }

    private async Task<AgentOperationLog?> FindAsync(string key)
    {
        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IAgentOperationLogRepository>();
        return await repository.GetByIdempotencyKeyAsync(key);
    }
}
