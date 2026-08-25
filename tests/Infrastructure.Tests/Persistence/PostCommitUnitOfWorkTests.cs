using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Domain.Events;
using Domain.Models;
using Infrastructure.Persistence;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SharedKernel;
using Xunit;

namespace Infrastructure.Tests.Persistence;

/// <summary>
/// The commit boundary itself - the real <see cref="PostCommitUnitOfWork"/> over the real
/// <see cref="PostCommitActions"/> and the real <see cref="SaveDurabilityInterceptor"/>, not
/// the hand-driven test double - on the ways a save can leave it: cancelled the instant it
/// commits, thrown out before it persists anything, and thrown out AFTER it persisted.
/// </summary>
/// <remarks>
/// No ambient transaction is reachable here (the InMemory provider has no transactions, so
/// <c>Database.CurrentTransaction</c> is always null), which is exactly the shape these cases
/// need: the drain happens at this save. The transaction-scoped half of the same behaviour,
/// and the same post-persistence cases against a database that really commits, are in
/// <c>WebApi.Tests/Integration/PostCommitBoundaryIntegrationTests</c> - PostgreSQL is what
/// decides commit timing, and this file only claims the state machine around it.
/// </remarks>
public class PostCommitUnitOfWorkTests
{
    /// <summary>Cancels a token source the moment a save has succeeded, before control returns.</summary>
    private sealed class CancelOnceSaved : SaveChangesInterceptor
    {
        private readonly CancellationTokenSource _cts;

        public CancelOnceSaved(CancellationTokenSource cts) => _cts = cts;

        public override ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            _cts.Cancel();
            return ValueTask.FromResult(result);
        }
    }

    /// <summary>Fails the next save, before anything reaches the store, then stands down.</summary>
    private sealed class FailNextSave : SaveChangesInterceptor
    {
        public bool Armed { get; set; }

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Armed)
            {
                Armed = false;
                throw new InvalidOperationException("save refused");
            }

            return ValueTask.FromResult(result);
        }
    }

    /// <summary>
    /// Fails the next save from AFTER it persisted - the stage EF reaches only once the rows
    /// are down, and the one <see cref="DomainEventsInterceptor"/> does its work in.
    /// </summary>
    private sealed class FailNextSaveAfterItPersisted : SaveChangesInterceptor
    {
        private readonly Func<Exception> _how;
        private readonly Action? _before;

        public FailNextSaveAfterItPersisted(Func<Exception> how, Action? before = null)
        {
            _how = how;
            _before = before;
        }

        public bool Armed { get; set; }

        public override ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            if (Armed)
            {
                Armed = false;
                _before?.Invoke();
                throw _how();
            }

            return ValueTask.FromResult(result);
        }
    }

    /// <summary>
    /// One scope's worth of the production boundary: a context, the queue, and the unit of
    /// work over both. The durability interceptor goes in FIRST, as
    /// <c>AddInfrastructure</c> registers it - a test interceptor that throws from
    /// <c>SavedChangesAsync</c> ahead of it would suppress the signal it exists to take.
    /// </summary>
    private static Scope NewScope(params IInterceptor[] interceptors)
        => NewScope(_ => interceptors);

    /// <summary>
    /// The same, for interceptors that need the queue this scope is built around -
    /// <see cref="DomainEventsInterceptor"/>'s handlers save through the very unit of work
    /// under test.
    /// </summary>
    private static Scope NewScope(Func<PostCommitActions, IInterceptor[]> interceptors)
    {
        var databaseName = Guid.NewGuid().ToString();
        var actions = new PostCommitActions(NullLogger<PostCommitActions>.Instance);
        var durability = new SaveDurabilityInterceptor(actions);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName)
            .AddInterceptors([durability, .. interceptors(actions)])
            .Options;

        var context = new ApplicationDbContext(options);
        context.Database.EnsureCreated();

        return new Scope(
            databaseName,
            context,
            actions,
            new PostCommitUnitOfWork(context, actions, durability));
    }

    private sealed record Scope(
        string DatabaseName,
        ApplicationDbContext Context,
        PostCommitActions Actions,
        IUnitOfWork UnitOfWork)
    {
        public IPostCommitActions PostCommit => Actions;

        /// <summary>Reads the store through a context that never staged any of it.</summary>
        public async Task<bool> RowExistsAsync(string key)
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(DatabaseName)
                .Options;
            await using var reader = new ApplicationDbContext(options);
            return await reader.Settings.AsNoTracking().AnyAsync(s => s.Key == key);
        }
    }

    private static Setting NewSetting() => Setting.Create($"post-commit-{Guid.NewGuid():N}", "v", DateTime.UtcNow);

    // ─── cancelled the instant the write became durable ──────────────

    [Fact]
    public async Task A_Request_Cancelled_The_Instant_The_Save_Commits_Still_Gets_Its_Effect()
    {
        // The client hangs up between the commit and the notification about it. The row is
        // durable and the worker that has to be told about it is a separate process - handing
        // the drain the request's token meant the notification was attempted with a token
        // already cancelled, and swallowed. The job then sat in the table with nobody told.
        using var cts = new CancellationTokenSource();
        var scope = NewScope(new CancelOnceSaved(cts));
        await using var context = scope.Context;

        var delivered = false;
        CancellationToken handed = default;

        scope.PostCommit.Enqueue("notify", ct =>
        {
            handed = ct;
            // What every real effect does first, and what SignalR does internally: honour the
            // token it was given. Before the fix this threw, and the drain logged it away.
            ct.ThrowIfCancellationRequested();
            delivered = true;
            return Task.CompletedTask;
        });

        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync(cts.Token);

        Assert.True(cts.IsCancellationRequested, "the interceptor must have cancelled during the save");
        Assert.True(delivered, "the effect must survive a request cancelled after the write is durable");
        Assert.False(handed.CanBeCanceled, "the drain must not depend on the request token at all");
    }

    // ─── a save that threw AFTER its rows went down ──────────────────

    [Fact]
    public async Task A_Save_That_Throws_After_It_Persisted_Still_Runs_Its_Effects_Once()
    {
        // The interleaving the boundary used to be blind to. EF runs the SavedChangesAsync
        // interceptors after the write - after the COMMIT of the implicit transaction - and
        // that is where domain-event dispatch happens. A throw from there is a throw over a
        // row that EXISTS, and treating it like a rollback discarded the only notification
        // the worker was ever going to get.
        var failure = new FailNextSaveAfterItPersisted(() => new InvalidOperationException("dispatch blew up"));
        var scope = NewScope(failure);
        await using var context = scope.Context;

        var ran = new List<string>();
        CancellationToken handed = default;

        scope.PostCommit.Enqueue("notify", ct =>
        {
            handed = ct;
            ran.Add("notify");
            return Task.CompletedTask;
        });

        var row = NewSetting();
        context.Settings.Add(row);
        failure.Armed = true;

        // The exception still belongs to the caller - the fix settles the queue, it does not
        // swallow the failure.
        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.UnitOfWork.SaveChangesAsync());

        Assert.True(await scope.RowExistsAsync(row.Key), "the save persisted before the interceptor threw");
        Assert.Equal(["notify"], ran);
        Assert.False(handed.CanBeCanceled, "a durable write's effects never take the request token");

        // Exactly once: the next save in the scope has nothing left to replay.
        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();
        Assert.Equal(["notify"], ran);
    }

    [Fact]
    public async Task A_Save_Whose_Token_Is_Cancelled_After_It_Persisted_Still_Runs_Its_Effects_Once()
    {
        // Same boundary, the cancellation flavour: the request is cancelled once the rows are
        // down and a post-save interceptor observes it, so the save throws
        // OperationCanceledException over a durable row. That is not a rollback either.
        using var cts = new CancellationTokenSource();
        var failure = new FailNextSaveAfterItPersisted(
            () => new OperationCanceledException(cts.Token),
            before: cts.Cancel);
        var scope = NewScope(failure);
        await using var context = scope.Context;

        var ran = new List<string>();
        CancellationToken handed = default;

        scope.PostCommit.Enqueue("notify", ct =>
        {
            handed = ct;
            ct.ThrowIfCancellationRequested();
            ran.Add("notify");
            return Task.CompletedTask;
        });

        var row = NewSetting();
        context.Settings.Add(row);
        failure.Armed = true;

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => scope.UnitOfWork.SaveChangesAsync(cts.Token));

        Assert.True(cts.IsCancellationRequested);
        Assert.True(await scope.RowExistsAsync(row.Key), "the save persisted before the token was observed");
        Assert.Equal(["notify"], ran);
        Assert.False(handed.CanBeCanceled, "a durable write's effects never take the request token");
    }

    // ─── a save that never landed ────────────────────────────────────

    [Fact]
    public async Task An_Action_Registered_For_A_Failed_Save_Never_Runs_Later()
    {
        // ThumbnailQueue registers the notification BEFORE the save - it has to, the effect
        // describes the row the save is about to write. So a save that throws leaves an armed
        // action behind, and the next successful save in the same scope used to drain it:
        // workers sent after a job that was never written.
        var failure = new FailNextSave();
        var scope = NewScope(failure);
        await using var context = scope.Context;

        var ran = new List<string>();
        scope.PostCommit.Enqueue("notify about the job that failed", () => ran.Add("stale"));

        failure.Armed = true;
        var refused = NewSetting();
        context.Settings.Add(refused);
        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.UnitOfWork.SaveChangesAsync());

        Assert.Empty(ran);
        Assert.False(await scope.RowExistsAsync(refused.Key), "nothing reached the store");
        context.Entry(refused).State = EntityState.Detached;

        // Any later work in the same scope - the same request retrying, a second queue write.
        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();

        Assert.Empty(ran);
    }

    [Fact]
    public async Task A_Failed_Save_Takes_Back_Only_What_It_Was_Carrying()
    {
        // The first save committed and drained what it carried, so the failure that follows
        // has nothing of its own to confuse with it - and must not reach past its own
        // registrations for anything registered afterwards either.
        var failure = new FailNextSave();
        var scope = NewScope(failure);
        await using var context = scope.Context;

        var ran = new List<string>();
        scope.PostCommit.Enqueue("first", () => ran.Add("first"));
        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();
        Assert.Equal(["first"], ran);

        scope.PostCommit.Enqueue("second", () => ran.Add("second"));
        failure.Armed = true;
        var refused = NewSetting();
        context.Settings.Add(refused);
        await Assert.ThrowsAsync<InvalidOperationException>(() => scope.UnitOfWork.SaveChangesAsync());
        context.Entry(refused).State = EntityState.Detached;

        scope.PostCommit.Enqueue("third", () => ran.Add("third"));
        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();

        // "second" belonged to the save that threw; "first" had already run once and must not
        // run again; "third" belongs to the save that succeeded.
        Assert.Equal(["first", "third"], ran);
    }

    // ─── a nested save, made from inside domain-event dispatch ───────

    [Fact]
    public async Task A_Nested_Save_That_Fails_Does_Not_Take_The_Outer_Saves_Effects_With_It()
    {
        // The re-entrant interleaving, over the real dispatch path rather than a stand-in for
        // it. EF reaches SavedChangesAsync once the outer save's rows are down;
        // DomainEventsInterceptor dispatches from there; the handler saves through the same
        // unit of work; that nested save is refused before it persists and asks the queue what
        // it may take back. The outer save is still inside its own SavedChangesAsync chain at
        // that moment - so if the queue does not already know which actions are the outer
        // save's, the nested failure takes them, and the handler converting its own failure
        // (ModelUploadedEventHandler converts every exception it can produce) lets the outer
        // save return normally over an emptied queue. A durable row, and nobody told.
        var refuse = new FailNextSave();
        var handler = new SaveAgainWhileDispatching();
        var scope = NewScope(_ =>
        [
            new DomainEventsInterceptor(DispatcherFor(handler), NullLogger<DomainEventsInterceptor>.Instance),
            refuse,
        ]);
        await using var context = scope.Context;

        var ran = new List<string>();
        var refused = NewSetting();

        handler.Behaviour = async ct =>
        {
            // What every caller does: register the effect that describes the row this save is
            // about to write, then save.
            scope.PostCommit.Enqueue("B", () => ran.Add("B"));
            context.Settings.Add(refused);
            refuse.Armed = true;
            try
            {
                await scope.UnitOfWork.SaveChangesAsync(ct);
            }
            finally
            {
                // A failed nested operation abandons its own staged row - StoreImportProcessor
                // clears the change tracker on exactly this path. Without it the interceptor's
                // post-dispatch flush would adopt the refused row and write it.
                context.Entry(refused).State = EntityState.Detached;
            }
        };

        scope.PostCommit.Enqueue("A", () => ran.Add("A"));
        context.EnvironmentMaps.Add(EnvironmentMap.Create($"post-commit-{Guid.NewGuid():N}", DateTime.UtcNow));

        // Returns normally - the nested failure never reaches this caller.
        await scope.UnitOfWork.SaveChangesAsync();

        Assert.Equal(["A"], ran);
        Assert.False(await scope.RowExistsAsync(refused.Key), "the nested save reached nothing");

        // Neither one is left armed for the next write in this scope to drain.
        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();
        Assert.Equal(["A"], ran);
    }

    [Fact]
    public async Task A_Nested_Save_That_Succeeds_Carries_Both_Saves_Effects_Once()
    {
        // The same route with the nested save allowed to land. Its own drain is the outermost
        // one that happens - there is no transaction here - so it takes both effects, and the
        // outer save must not replay them when it settles afterwards.
        var handler = new SaveAgainWhileDispatching();
        var scope = NewScope(_ =>
        [
            new DomainEventsInterceptor(DispatcherFor(handler), NullLogger<DomainEventsInterceptor>.Instance),
        ]);
        await using var context = scope.Context;

        var ran = new List<string>();
        var nested = NewSetting();

        handler.Behaviour = async ct =>
        {
            scope.PostCommit.Enqueue("B", () => ran.Add("B"));
            context.Settings.Add(nested);
            await scope.UnitOfWork.SaveChangesAsync(ct);
        };

        scope.PostCommit.Enqueue("A", () => ran.Add("A"));
        context.EnvironmentMaps.Add(EnvironmentMap.Create($"post-commit-{Guid.NewGuid():N}", DateTime.UtcNow));
        await scope.UnitOfWork.SaveChangesAsync();

        Assert.Equal(["A", "B"], ran);
        Assert.True(await scope.RowExistsAsync(nested.Key), "the nested save landed");

        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();
        Assert.Equal(["A", "B"], ran);
    }

    // ─── the guarantees the above must not have broken ───────────────

    [Fact]
    public async Task Actions_Run_In_Order_And_Exactly_Once()
    {
        var scope = NewScope();
        await using var context = scope.Context;

        var ran = new List<string>();
        scope.PostCommit.Enqueue("a", () => ran.Add("a"));
        scope.PostCommit.Enqueue("b", () => ran.Add("b"));
        scope.PostCommit.Enqueue("c", () => ran.Add("c"));

        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();
        Assert.Equal(["a", "b", "c"], ran);

        // A second commit in the same scope has nothing left to say.
        context.Settings.Add(NewSetting());
        await scope.UnitOfWork.SaveChangesAsync();
        Assert.Equal(["a", "b", "c"], ran);
    }

    [Fact]
    public async Task An_Effect_That_Throws_Does_Not_Report_The_Commit_As_Failed()
    {
        var scope = NewScope();
        await using var context = scope.Context;

        var ran = new List<string>();
        scope.PostCommit.Enqueue("throws", () => throw new InvalidOperationException("notify failed"));
        scope.PostCommit.Enqueue("after", () => ran.Add("after"));

        var setting = NewSetting();
        context.Settings.Add(setting);
        await scope.UnitOfWork.SaveChangesAsync();

        // The write is durable, so the request must not be told otherwise - and the rest of
        // the queue still gets its turn.
        Assert.Equal(["after"], ran);
        Assert.NotNull(await context.Settings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == setting.Key));
    }

    [Fact]
    public async Task An_Effect_That_Throws_After_A_Post_Persistence_Failure_Still_Does_Not_Mask_The_Save()
    {
        // The two "an error here must not lie about the write" rules meeting: the save threw
        // after persisting, and one of the effects it is owed throws too. The effect failure
        // is logged and the rest of the queue still runs; the SAVE's exception is what the
        // caller sees, unchanged.
        var failure = new FailNextSaveAfterItPersisted(() => new InvalidOperationException("dispatch blew up"));
        var scope = NewScope(failure);
        await using var context = scope.Context;

        var ran = new List<string>();
        scope.PostCommit.Enqueue("throws", () => throw new NotSupportedException("notify failed"));
        scope.PostCommit.Enqueue("after", () => ran.Add("after"));

        context.Settings.Add(NewSetting());
        failure.Armed = true;

        var thrown = await Assert.ThrowsAsync<InvalidOperationException>(
            () => scope.UnitOfWork.SaveChangesAsync());
        Assert.Equal("dispatch blew up", thrown.Message);
        Assert.Equal(["after"], ran);
    }

    /// <summary>
    /// A real <see cref="DomainEventDispatcher"/> over one handler, so the nested save above
    /// travels the production route - interceptor, dispatcher, handler - rather than a
    /// hand-made imitation of it. The dispatcher's own catch is part of what is under test:
    /// it turns a handler that throws into a failure Result nobody upstream reads.
    /// </summary>
    private static IDomainEventDispatcher DispatcherFor<TEvent>(IDomainEventHandler<TEvent> handler)
        where TEvent : IDomainEvent
    {
        var services = new ServiceCollection();
        services.AddSingleton(handler);
        return new DomainEventDispatcher(
            services.BuildServiceProvider(),
            NullLogger<DomainEventDispatcher>.Instance);
    }

    /// <summary>
    /// Stands where <c>ModelUploadedEventHandler</c> stands: a handler that reacts to a
    /// persisted event by writing more, and converts its own failure into a failure Result
    /// instead of letting it out.
    /// </summary>
    private sealed class SaveAgainWhileDispatching : IDomainEventHandler<EnvironmentMapCreatedEvent>
    {
        public Func<CancellationToken, Task>? Behaviour { get; set; }

        public async Task<Result> Handle(EnvironmentMapCreatedEvent domainEvent, CancellationToken cancellationToken)
        {
            var behaviour = Behaviour;
            Behaviour = null;

            if (behaviour is null)
            {
                return Result.Success();
            }

            try
            {
                await behaviour(cancellationToken);
                return Result.Success();
            }
            catch (Exception ex)
            {
                return Result.Failure(new Error("NestedSaveFailed", ex.Message));
            }
        }
    }
}
