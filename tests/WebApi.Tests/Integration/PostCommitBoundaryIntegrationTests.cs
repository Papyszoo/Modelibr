using System.Data.Common;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Domain.Events;
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
/// Three interceptors give the test the interleavings it needs, and all three are honest about
/// what they stand for. <see cref="CancelWhenCommitted"/> cancels the request token from EF's
/// after-commit callback - the real "the client hung up between COMMIT and the notification".
/// <see cref="FailNextSave"/> throws before anything reaches the server, which is what a save
/// failure has to look like inside a transaction that then commits: a failure the DATABASE
/// sees aborts the whole transaction, so it could never be followed by a successful commit.
/// <see cref="FailAfterSave"/> throws from <c>SavedChangesAsync</c>, which EF reaches only
/// once the rows are written - for a save with no explicit transaction that is after the
/// implicit COMMIT, and it stands for what <c>DomainEventsInterceptor</c> really does there:
/// cancellable asynchronous dispatch that can fail over a row nothing can take back.
/// </para>
/// <para>
/// The interceptor order below matches production: <c>SaveDurabilityInterceptor</c> FIRST,
/// because EF stops the <c>SavedChangesAsync</c> chain at the first interceptor that throws
/// and the durability signal has to be taken before the throwing one gets its turn.
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
    private readonly FailAfterSave _failAfterSave = new();
    private readonly FailAfterCommit _failAfterCommit = new();
    private readonly ReentrantHandler _reentrant = new();
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
                    sp.GetRequiredService<SaveDurabilityInterceptor>(),
                    sp.GetRequiredService<DomainEventsInterceptor>(),
                    _cancelOnCommit,
                    _failNextSave,
                    _failAfterSave,
                    _failAfterCommit));

            // A real IDomainEventHandler, alongside the production ones, so the re-entrant
            // save below travels the production route: EF's SavedChangesAsync ->
            // DomainEventsInterceptor -> DomainEventDispatcher -> a handler that saves
            // through the same scoped unit of work. Nothing here reaches into the queue.
            services.AddSingleton(_reentrant);
            services.AddScoped<IDomainEventHandler<EnvironmentMapCreatedEvent>, ReentrantSaveHandler>();
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

        Assert.Empty(ran);
        Assert.False(await RowExistsAsync(refused.Key), "the save was refused before anything reached the server");

        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();

        Assert.Empty(ran);
        Assert.False(await RowExistsAsync(refused.Key));
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

    // ─── a save that threw AFTER the implicit COMMIT ─────────────────

    [Fact]
    public async Task A_Save_That_Throws_After_The_Implicit_Commit_Still_Runs_Its_Effects_Once()
    {
        // The interleaving the boundary was blind to, on the database that decides it. With no
        // explicit transaction open, PostgreSQL has already committed by the time EF calls the
        // SavedChangesAsync interceptors - which is where DomainEventsInterceptor does its
        // work. A throw from there is a throw over a row nothing can take back, and treating
        // it as a rollback discarded the only notification the worker was going to get.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        CancellationToken handed = default;

        var durable = NewSetting();
        context.Settings.Add(durable);
        postCommit.Enqueue("notify", ct =>
        {
            handed = ct;
            ran.Add("notify");
            return Task.CompletedTask;
        });

        _failAfterSave.Arm(() => new InvalidOperationException("dispatch blew up"));

        // The failure still belongs to the caller: settling the queue is not swallowing it.
        await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.SaveChangesAsync());

        Assert.True(
            await RowExistsAsync(durable.Key),
            "the implicit transaction committed before SavedChangesAsync was ever called");
        Assert.Equal(["notify"], ran);
        Assert.False(handed.CanBeCanceled, "a durable write's effects never take the request token");

        // Exactly once - the next save in this scope has nothing left to replay.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["notify"], ran);
    }

    [Fact]
    public async Task A_Save_Cancelled_After_The_Implicit_Commit_Still_Runs_Its_Effects_Once()
    {
        // Same boundary, the cancellation flavour: the client hangs up once the rows are down
        // and a post-save interceptor observes the token, so the save throws
        // OperationCanceledException over a committed row. Still not a rollback.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        using var cts = new CancellationTokenSource();
        var ran = new List<string>();
        CancellationToken handed = default;

        var durable = NewSetting();
        context.Settings.Add(durable);
        postCommit.Enqueue("notify", ct =>
        {
            handed = ct;
            // What a real effect does first, and what SignalR does internally.
            ct.ThrowIfCancellationRequested();
            ran.Add("notify");
            return Task.CompletedTask;
        });

        _failAfterSave.Arm(() => new OperationCanceledException(cts.Token), before: cts.Cancel);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => unitOfWork.SaveChangesAsync(cts.Token));

        Assert.True(cts.IsCancellationRequested);
        Assert.True(await RowExistsAsync(durable.Key), "the row committed before the token was observed");
        Assert.Equal(["notify"], ran);
        Assert.False(handed.CanBeCanceled, "the drain must not depend on the request token at all");
    }

    // ─── SavedChangesAsync is not the boundary inside a transaction ───

    [Fact]
    public async Task A_Post_Save_Failure_Inside_A_Transaction_Waits_For_The_Outer_Commit()
    {
        // The same post-save throw one level in. Here the INSERT is in an open transaction, so
        // SavedChangesAsync is NOT durability - nothing may fire yet - but the write is in the
        // transaction, so when the outer boundary commits the effect is owed exactly once.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var row = NewSetting();

        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            context.Settings.Add(row);
            postCommit.Enqueue("effect of the write inside the transaction", () => ran.Add("inside"));
            _failAfterSave.Arm(() => new InvalidOperationException("dispatch blew up"));

            // The INSERT reached the server inside the open transaction; only the dispatch
            // after it failed, so the transaction is intact and the handler carries on.
            await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.SaveChangesAsync(ct));

            Assert.Empty(ran);
            Assert.False(await RowExistsAsync(row.Key), "uncommitted - no other connection may see it");
            return Result.Success(1);
        });

        Assert.True(result.IsSuccess);
        Assert.Equal(["inside"], ran);
        Assert.True(await RowExistsAsync(row.Key));

        // Exactly once.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["inside"], ran);
    }

    [Fact]
    public async Task A_Post_Save_Failure_Inside_A_Transaction_That_Rolls_Back_Runs_Nothing()
    {
        // And the other ending: the post-save throw propagates, the transaction rolls back,
        // and the write it claimed goes with it. "The rows are down" is not durability while a
        // transaction can still undo them - the rollback rule outranks the save rule.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var row = NewSetting();

        await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.InTransactionAsync<int>(async ct =>
        {
            context.Settings.Add(row);
            postCommit.Enqueue("effect of a write the rollback undid", () => ran.Add("inside"));
            _failAfterSave.Arm(() => new InvalidOperationException("dispatch blew up"));
            await unitOfWork.SaveChangesAsync(ct);
            return Result.Success(1);
        }));

        Assert.Empty(ran);
        Assert.False(await RowExistsAsync(row.Key));

        // A later commit in the same scope must not pick the discarded action up either.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Empty(ran);
    }

    [Fact]
    public async Task A_Transaction_That_Throws_After_Its_Commit_Returned_Still_Runs_Its_Effects_Once()
    {
        // The transaction boundary's version of "a throw is not a rollback". COMMIT went to
        // the server and came back; whatever failed afterwards cannot un-write those rows, and
        // the request failing is not permission to drop the notification about them.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        CancellationToken handed = default;
        var row = NewSetting();

        _failAfterCommit.Arm();

        await Assert.ThrowsAnyAsync<Exception>(() => unitOfWork.InTransactionAsync<int>(async ct =>
        {
            context.Settings.Add(row);
            postCommit.Enqueue("notify", token =>
            {
                handed = token;
                ran.Add("notify");
                return Task.CompletedTask;
            });
            await unitOfWork.SaveChangesAsync(ct);
            return Result.Success(1);
        }));

        Assert.True(await RowExistsAsync(row.Key), "COMMIT returned - the rows are durable");
        Assert.Equal(["notify"], ran);
        Assert.False(handed.CanBeCanceled, "a durable write's effects never take the request token");

        // Exactly once.
        using var later = _host.Services.CreateScope();
        var laterContext = later.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        laterContext.Settings.Add(NewSetting());
        await later.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync();
        Assert.Equal(["notify"], ran);
    }

    // ─── an action enqueued in the breath before the transaction ──────

    [Fact]
    public async Task An_Action_Enqueued_Just_Before_A_Failing_Transaction_Is_Discarded_With_It()
    {
        // The ordering every handler is entitled to use: stage the mutation, enqueue the
        // effect that DESCRIBES it, then open the transaction that performs it. Baselining the
        // rollback on the queue length called that action somebody else's already-committed
        // work and preserved it - so the next unrelated save in the scope drained a
        // notification for a bind that had been rolled back. Both endings roll back.
        await AssertEnqueueBeforeTransactionIsDiscardedAsync(
            _ => Task.FromResult(Result.Failure<int>(new Error("Nope", "no"))));
        await AssertEnqueueBeforeTransactionIsDiscardedAsync(
            _ => throw new InvalidOperationException("work blew up"));
    }

    private async Task AssertEnqueueBeforeTransactionIsDiscardedAsync(
        Func<CancellationToken, Task<Result<int>>> ending)
    {
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var row = NewSetting();

        context.Settings.Add(row);
        postCommit.Enqueue("effect of the write the transaction was going to make", () => ran.Add("stale"));

        try
        {
            var result = await unitOfWork.InTransactionAsync(ending);
            Assert.True(result.IsFailure);
        }
        catch (InvalidOperationException)
        {
            // the throwing ending
        }

        Assert.Empty(ran);
        Assert.False(await RowExistsAsync(row.Key));

        // The regression itself: an unrelated later save in the same scope used to drain it.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Empty(ran);
    }

    [Fact]
    public async Task An_Action_Enqueued_Just_Before_A_Committing_Transaction_Runs_Once_After_It()
    {
        // The other half of owning it: if the transaction commits, the action it was queued
        // for is owed - once, after the commit, and not before.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var row = NewSetting();

        context.Settings.Add(row);
        postCommit.Enqueue("effect of the write the transaction makes", () => ran.Add("committed"));

        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            Assert.Empty(ran);
            await Task.Yield();
            return Result.Success(1);
        });

        Assert.True(result.IsSuccess);
        Assert.Equal(["committed"], ran);
        Assert.True(await RowExistsAsync(row.Key));

        // Exactly once.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["committed"], ran);
    }

    // ─── a nested save, made from inside domain-event dispatch ───────

    [Fact]
    public async Task A_Nested_Save_That_Fails_Does_Not_Take_The_Outer_Saves_Effects_With_It()
    {
        // The re-entrant interleaving, on the production route. EF's SavedChangesAsync fires
        // once the outer save's rows are down; DomainEventsInterceptor dispatches from there;
        // a handler saves through the same scoped unit of work; that nested save is refused
        // before it reaches the server. The nested boundary is then asked which of the queued
        // effects it may take back - and the outer save, still inside its own SavedChangesAsync
        // chain, has not been able to say which ones are already its own.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var refused = NewSetting();
        ArmNestedSaveThatFailsBeforePersisting(refused, () => ran.Add("B"));

        postCommit.Enqueue("A", () => ran.Add("A"));
        var map = NewEnvironmentMap();
        context.EnvironmentMaps.Add(map);

        // Returns normally: dispatch converted the nested failure into a failure Result, the
        // way ModelUploadedEventHandler converts one and the way DomainEventDispatcher
        // converts a handler that throws. Nothing about it reaches this caller.
        await unitOfWork.SaveChangesAsync();

        Assert.Equal(["A"], ran);
        Assert.True(await EnvironmentMapExistsAsync(map.Name), "the outer save is durable");
        Assert.False(await RowExistsAsync(refused.Key), "the nested save reached nothing");

        // Neither effect is left armed for the next write in this scope to drain.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["A"], ran);
    }

    [Fact]
    public async Task A_Nested_Save_That_Fails_Inside_A_Transaction_Does_Not_Take_The_Committed_Effects_With_It()
    {
        // Same interleaving with an explicit transaction open, where the save is not the
        // durability point and the COMMIT is. The nested failure still must not reach past
        // what the outer save is carrying.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var refused = NewSetting();
        ArmNestedSaveThatFailsBeforePersisting(refused, () => ran.Add("B"));

        var map = NewEnvironmentMap();
        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            postCommit.Enqueue("A", () => ran.Add("A"));
            context.EnvironmentMaps.Add(map);
            await unitOfWork.SaveChangesAsync(ct);
            return Result.Success(1);
        });

        Assert.True(result.IsSuccess);
        Assert.Equal(["A"], ran);
        Assert.True(await EnvironmentMapExistsAsync(map.Name), "the transaction committed");
        Assert.False(await RowExistsAsync(refused.Key), "the nested save reached nothing");

        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["A"], ran);
    }

    [Fact]
    public async Task A_Rollback_Still_Outranks_What_A_Nested_Save_Left_The_Queue()
    {
        // The other half of the transaction case: claiming the outer save's effects early
        // must not make them survive the rollback of the transaction that was supposed to
        // make them true. DiscardFrom outranks the claim, and still does.
        using var scope = _host.Services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var postCommit = scope.ServiceProvider.GetRequiredService<IPostCommitActions>();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var ran = new List<string>();
        var refused = NewSetting();
        ArmNestedSaveThatFailsBeforePersisting(refused, () => ran.Add("B"));

        var map = NewEnvironmentMap();
        var result = await unitOfWork.InTransactionAsync<int>(async ct =>
        {
            postCommit.Enqueue("A", () => ran.Add("A"));
            context.EnvironmentMaps.Add(map);
            await unitOfWork.SaveChangesAsync(ct);
            return Result.Failure<int>(new Error("Nope", "the work decided against itself"));
        });

        Assert.True(result.IsFailure);
        Assert.Empty(ran);
        Assert.False(await EnvironmentMapExistsAsync(map.Name), "the transaction rolled back");
        Assert.False(await RowExistsAsync(refused.Key));

        // And a later commit in the same scope must not pick either of them up.
        context.ChangeTracker.Clear();
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Empty(ran);
    }

    // ─── harness ─────────────────────────────────────────────────────

    /// <summary>
    /// Arms the domain-event handler to make exactly one nested decorated save: it registers
    /// its own effect first (every caller does - the effect describes the row the save is
    /// about to write), stages a row, and is refused before anything reaches the server.
    /// </summary>
    /// <remarks>
    /// The staged row is abandoned afterwards, which is what a failed nested operation really
    /// does here - <c>StoreImportProcessor</c> clears the change tracker on exactly this path.
    /// Without it the interceptor's own post-dispatch flush would adopt the refused row and
    /// write it, and the test would be asserting something else entirely.
    /// </remarks>
    private void ArmNestedSaveThatFailsBeforePersisting(Setting row, Action effect)
        => _reentrant.Arm(async (sp, ct) =>
        {
            var nestedUnitOfWork = sp.GetRequiredService<IUnitOfWork>();
            var nestedContext = sp.GetRequiredService<ApplicationDbContext>();
            sp.GetRequiredService<IPostCommitActions>().Enqueue("B", effect);

            nestedContext.Settings.Add(row);
            _failNextSave.Arm();
            await nestedUnitOfWork.SaveChangesAsync(ct);
        });

    private static EnvironmentMap NewEnvironmentMap()
        => EnvironmentMap.Create($"post-commit-{Guid.NewGuid():N}", DateTime.UtcNow);

    private async Task<bool> EnvironmentMapExistsAsync(string name)
    {
        using var scope = _host.Services.CreateScope();
        var read = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await read.EnvironmentMaps.AsNoTracking().AnyAsync(m => m.Name == name);
    }

    /// <summary>
    /// What the handler below should do the next time the event reaches it, armed one
    /// dispatch at a time. A singleton, because the test owns it and the handler is scoped.
    /// </summary>
    private sealed class ReentrantHandler
    {
        private Func<IServiceProvider, CancellationToken, Task>? _behaviour;

        public void Arm(Func<IServiceProvider, CancellationToken, Task> behaviour)
            => _behaviour = behaviour;

        public Func<IServiceProvider, CancellationToken, Task>? Take()
        {
            var behaviour = _behaviour;
            _behaviour = null;
            return behaviour;
        }
    }

    /// <summary>
    /// A real domain-event handler, resolved and invoked by the real
    /// <c>DomainEventDispatcher</c> from <c>DomainEventsInterceptor.SavedChangesAsync</c>.
    /// It converts a failure into a failure <c>Result</c> rather than letting it out, which is
    /// what <c>ModelUploadedEventHandler</c> does with every exception it can produce - and
    /// what makes the outer save return normally over a queue the nested save has edited.
    /// </summary>
    private sealed class ReentrantSaveHandler : IDomainEventHandler<EnvironmentMapCreatedEvent>
    {
        private readonly ReentrantHandler _behaviour;
        private readonly IServiceProvider _scope;

        public ReentrantSaveHandler(ReentrantHandler behaviour, IServiceProvider scope)
        {
            _behaviour = behaviour;
            _scope = scope;
        }

        public async Task<Result> Handle(EnvironmentMapCreatedEvent domainEvent, CancellationToken cancellationToken)
        {
            var behaviour = _behaviour.Take();
            if (behaviour is null)
            {
                return Result.Success();
            }

            try
            {
                await behaviour(_scope, cancellationToken);
                return Result.Success();
            }
            catch (Exception ex)
            {
                return Result.Failure(new Error("ReentrantSaveFailed", ex.Message));
            }
        }
    }


    private static Setting NewSetting() => Setting.Create($"post-commit-{Guid.NewGuid():N}", "v", DateTime.UtcNow);

    /// <summary>Asks the database, on a scope and a connection that staged none of this.</summary>
    private async Task<bool> RowExistsAsync(string key)
    {
        using var scope = _host.Services.CreateScope();
        var read = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await read.Settings.AsNoTracking().AnyAsync(s => s.Key == key);
    }

    /// <summary>
    /// Fails the next save from <c>SavedChangesAsync</c> - the stage EF reaches only after the
    /// rows are written, and after the implicit COMMIT when no explicit transaction is open.
    /// </summary>
    private sealed class FailAfterSave : SaveChangesInterceptor
    {
        private Func<Exception>? _how;
        private Action? _before;

        public void Arm(Func<Exception> how, Action? before = null)
        {
            _how = how;
            _before = before;
        }

        public override ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            var how = _how;
            var before = _before;
            _how = null;
            _before = null;

            if (how is null)
            {
                return ValueTask.FromResult(result);
            }

            before?.Invoke();
            throw how();
        }
    }

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

    /// <summary>
    /// Throws once from EF's after-commit callback, so the COMMIT has been sent, acknowledged
    /// and recorded by <c>SaveDurabilityInterceptor</c> (registered ahead of this) before the
    /// failure happens. Stands for anything that can go wrong between a successful COMMIT and
    /// the caller getting its result.
    /// </summary>
    private sealed class FailAfterCommit : DbTransactionInterceptor
    {
        private bool _armed;

        public void Arm() => _armed = true;

        public override Task TransactionCommittedAsync(
            DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
        {
            if (_armed)
            {
                _armed = false;
                throw new InvalidOperationException("everything after the commit blew up");
            }

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
