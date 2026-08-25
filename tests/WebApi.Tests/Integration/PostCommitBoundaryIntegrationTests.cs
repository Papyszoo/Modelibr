using System.Data.Common;
using Application.Abstractions;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SharedKernel;
using Xunit;

namespace WebApi.Tests.Integration;

/// <summary>
/// The post-commit boundary where a real transaction is open: the production
/// <c>PostCommitUnitOfWork</c> over the production <c>PostCommitActions</c>, resolved from the
/// application's own container, against real PostgreSQL.
/// </summary>
/// <remarks>
/// <para>
/// It has to be a real database. The InMemory provider has no transactions at all -
/// <c>Database.CurrentTransaction</c> is always null there - so nothing below PostgreSQL can
/// tell "this save joined an open transaction and must wait" apart from "this save committed
/// and must drain now", which is the entire distinction under test. The non-transactional half
/// is in <c>Infrastructure.Tests/Persistence/PostCommitUnitOfWorkTests</c>.
/// </para>
/// <para>
/// Two interceptors give the test the interleavings it needs, and both are honest about what
/// they stand for. <see cref="CancelWhenCommitted"/> cancels the request token from EF's
/// after-commit callback - the real "the client hung up between COMMIT and the notification".
/// <see cref="FailNextSave"/> throws before anything reaches the server, which is what a save
/// failure has to look like inside a transaction that then commits: a failure the DATABASE
/// sees aborts the whole transaction, so it could never be followed by a successful commit.
/// </para>
/// </remarks>
[Trait("Category", "Integration")]
[Collection(PostgresIntegrationCollection.Name)]
public class PostCommitBoundaryIntegrationTests
    : IClassFixture<ModelibrWebFactory>, IAsyncLifetime
{
    private readonly ModelibrWebFactory _factory;
    private readonly CancelWhenCommitted _cancelOnCommit = new();
    private readonly FailNextSave _failNextSave = new();
    private WebApplicationFactory<Program> _host = null!;

    public PostCommitBoundaryIntegrationTests(ModelibrWebFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        // Same database, a context wired with the two test interceptors. The DbContext options
        // are the only place EF takes interceptors from - registering them in DI does not
        // reach it - so the registration is replaced rather than added to. WithWebHostBuilder
        // rather than a second ModelibrWebFactory: the factory drops and recreates the
        // database in its constructor.
        _host = _factory.WithWebHostBuilder(builder => builder.ConfigureServices((context, services) =>
        {
            var connectionString = context.Configuration.GetConnectionString("Default")!;

            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<DbContextOptions>();
            services.AddDbContext<ApplicationDbContext>((sp, options) => options
                .UseNpgsql(connectionString)
                .AddInterceptors(
                    sp.GetRequiredService<DomainEventsInterceptor>(),
                    _cancelOnCommit,
                    _failNextSave));
        }));

        using var scope = _host.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.MigrateAsync();
    }

    public Task DisposeAsync()
    {
        _host.Dispose();
        return Task.CompletedTask;
    }

    // ─── cancelled the instant the transaction committed ─────────────

    [Fact]
    public async Task A_Request_Cancelled_The_Instant_The_Transaction_Commits_Still_Gets_Its_Effects()
    {
        // COMMIT returns, the client is already gone, and the effects describe rows every
        // other process can now read. Handing the drain the request's token lost them.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        using var cts = new CancellationTokenSource();
        _cancelOnCommit.Arm(cts);

        var delivered = new List<string>();
        CancellationToken handed = default;

        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            context.Settings.Add(NewSetting());
            postCommit.Enqueue("notify", token =>
            {
                handed = token;
                // What a real effect does first, and what SignalR does internally.
                token.ThrowIfCancellationRequested();
                delivered.Add("notify");
                return Task.CompletedTask;
            });
            await unitOfWork.SaveChangesAsync(ct);
            return Result.Success(1);
        }, cts.Token);

        Assert.True(result.IsSuccess);
        Assert.True(cts.IsCancellationRequested, "the interceptor must have cancelled at COMMIT");
        Assert.Equal(["notify"], delivered);
        Assert.False(handed.CanBeCanceled, "the drain must not depend on the request token at all");
    }

    // ─── a save that never landed, inside a transaction that did ─────

    [Fact]
    public async Task A_Failed_Save_Loses_Its_Own_Effects_And_Keeps_What_An_Earlier_Save_Carried()
    {
        // The ownership boundary, stated as the interleaving that needs it: two writes inside
        // one transaction, the first committed into it, the second refused. The rollback rule
        // alone cannot separate them - both were registered inside the same transaction - and
        // "discard everything queued" would take the first write's effects with it.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var survivor = NewSetting();
        var refused = NewSetting();

        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            // Valid work, committed into the open transaction.
            context.Settings.Add(survivor);
            postCommit.Enqueue("effect of the write that landed", () => ran.Add("landed"));
            await unitOfWork.SaveChangesAsync(ct);

            // Work that registers first (it has to - the effect describes the row) and then
            // fails to save.
            context.Settings.Add(refused);
            postCommit.Enqueue("effect of the write that did not", () => ran.Add("refused"));
            _failNextSave.Arm();
            await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.SaveChangesAsync(ct));

            // Nothing reached the server, so the transaction is healthy; drop the staged row
            // the way a handler recovering from a rejected save would.
            context.Entry(refused).State = EntityState.Detached;

            Assert.Empty(ran); // nothing may fire before the outermost boundary commits
            return Result.Success(1);
        });

        Assert.True(result.IsSuccess);
        Assert.Equal(["landed"], ran);

        // And the database agrees about which write the surviving effect describes.
        using var check = _host.Services.CreateScope();
        var read = check.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.NotNull(await read.Settings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == survivor.Key));
        Assert.Null(await read.Settings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == refused.Key));
    }

    [Fact]
    public async Task An_Action_Registered_For_A_Failed_Save_Never_Runs_On_A_Later_Commit()
    {
        // The same failure without a transaction around it, through the container's own unit
        // of work: the stale action must not be drained by the next successful save in the
        // scope.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();

        var refused = NewSetting();
        context.Settings.Add(refused);
        postCommit.Enqueue("notify about a job that was never written", () => ran.Add("stale"));
        _failNextSave.Arm();
        await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.SaveChangesAsync());
        context.Entry(refused).State = EntityState.Detached;

        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();

        Assert.Empty(ran);
    }

    // ─── the transaction's own verdict ───────────────────────────────

    [Fact]
    public async Task An_Outer_Rollback_Runs_Nothing_Even_What_A_Nested_Save_Had_Committed_Into_It()
    {
        // The rollback rule outranks the save rule, and has to: a save that joined the
        // transaction is exactly what the rollback undoes. A failure Result rolls back the
        // same way a throw does, so both are asserted.
        await AssertRollbackRunsNothingAsync(_ => Task.FromResult(Result.Failure<int>(new Error("Nope", "no"))));
        await AssertRollbackRunsNothingAsync(_ => throw new InvalidOperationException("work blew up"));
    }

    private async Task AssertRollbackRunsNothingAsync(Func<CancellationToken, Task<Result<int>>> ending)
    {
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var rolledBack = NewSetting();

        async Task<Result<int>> Work(CancellationToken ct)
        {
            context.Settings.Add(rolledBack);
            postCommit.Enqueue("effect of a write inside the transaction", () => ran.Add("inside"));
            await unitOfWork.SaveChangesAsync(ct); // joins the transaction - committed into it
            return await ending(ct);
        }

        try
        {
            var result = await unitOfWork.InTransactionAsync(Work);
            Assert.True(result.IsFailure);
        }
        catch (InvalidOperationException)
        {
            // the throwing ending
        }

        Assert.Empty(ran);

        // A later commit in the same scope must not pick the discarded action up either.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Empty(ran);

        using var check = _host.Services.CreateScope();
        var read = check.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.Null(await read.Settings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == rolledBack.Key));
    }

    [Fact]
    public async Task A_Successful_Outer_Commit_Drains_Every_Action_Once_And_In_Order()
    {
        // Several nested saves, each of which would have been a durable commit on its own
        // without the transaction. None of them may drain; the outermost boundary drains all
        // of them, in registration order, once.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();

        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            foreach (var step in new[] { "first", "second", "third" })
            {
                context.Settings.Add(NewSetting());
                postCommit.Enqueue(step, () => ran.Add(step));
                await unitOfWork.SaveChangesAsync(ct);
                Assert.Empty(ran);
            }

            // A nested InTransactionAsync joins rather than nesting, so it must not drain either.
            var inner = await unitOfWork.InTransactionAsync<int>(innerCt =>
            {
                postCommit.Enqueue("fourth", () => ran.Add("fourth"));
                return Task.FromResult(Result.Success(0));
            }, ct);
            Assert.True(inner.IsSuccess);
            Assert.Empty(ran);

            return Result.Success(1);
        });

        Assert.True(result.IsSuccess);
        Assert.Equal(["first", "second", "third", "fourth"], ran);

        // Exactly once: a further commit in the same scope replays nothing.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["first", "second", "third", "fourth"], ran);
    }

    // ─── harness ─────────────────────────────────────────────────────

    private static Setting NewSetting() => Setting.Create($"post-commit-{Guid.NewGuid():N}", "v", DateTime.UtcNow);

    /// <summary>Cancels a request token from EF's after-commit callback, and only when armed.</summary>
    private sealed class CancelWhenCommitted : DbTransactionInterceptor
    {
        private CancellationTokenSource? _cts;

        public void Arm(CancellationTokenSource cts) => _cts = cts;

        public override Task TransactionCommittedAsync(
            DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
        {
            var cts = _cts;
            _cts = null;
            cts?.Cancel();
            return Task.CompletedTask;
        }
    }

    /// <summary>Refuses the next save before anything reaches the server, then stands down.</summary>
    private sealed class FailNextSave : SaveChangesInterceptor
    {
        private bool _armed;

        public void Arm() => _armed = true;

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (_armed)
            {
                _armed = false;
                throw new InvalidOperationException("save refused");
            }

            return ValueTask.FromResult(result);
        }
    }
}
