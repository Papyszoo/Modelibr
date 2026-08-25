using Application.Abstractions;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Infrastructure.Tests.Persistence;

/// <summary>
/// The commit boundary itself - the real <see cref="PostCommitUnitOfWork"/> over the real
/// <see cref="PostCommitActions"/>, not the hand-driven test double - on the two paths a save
/// can leave it in: the request is cancelled the instant the save commits, and the save
/// throws.
/// </summary>
/// <remarks>
/// No ambient transaction is reachable here (the InMemory provider has no transactions, so
/// <c>Database.CurrentTransaction</c> is always null), which is exactly the shape these cases
/// need: the drain happens at this save. The transaction-scoped half of the same behaviour is
/// in <c>WebApi.Tests/Integration/PostCommitBoundaryIntegrationTests</c>, against real
/// PostgreSQL.
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

    private static ApplicationDbContext NewContext(params IInterceptor[] interceptors)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .AddInterceptors(interceptors)
            .Options;
        var context = new ApplicationDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    private static (PostCommitActions Actions, IUnitOfWork UnitOfWork) Boundary(ApplicationDbContext context)
    {
        var actions = new PostCommitActions(NullLogger<PostCommitActions>.Instance);
        return (actions, new PostCommitUnitOfWork(context, actions));
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
        await using var context = NewContext(new CancelOnceSaved(cts));
        var (actions, unitOfWork) = Boundary(context);

        var delivered = false;
        CancellationToken handed = default;

        ((IPostCommitActions)actions).Enqueue("notify", ct =>
        {
            handed = ct;
            // What every real effect does first, and what SignalR does internally: honour the
            // token it was given. Before the fix this threw, and the drain logged it away.
            ct.ThrowIfCancellationRequested();
            delivered = true;
            return Task.CompletedTask;
        });

        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync(cts.Token);

        Assert.True(cts.IsCancellationRequested, "the interceptor must have cancelled during the save");
        Assert.True(delivered, "the effect must survive a request cancelled after the write is durable");
        Assert.False(handed.CanBeCanceled, "the drain must not depend on the request token at all");
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
        await using var context = NewContext(failure);
        var (actions, unitOfWork) = Boundary(context);

        var ran = new List<string>();
        ((IPostCommitActions)actions).Enqueue("notify about the job that failed", () => ran.Add("stale"));

        failure.Armed = true;
        context.Settings.Add(NewSetting());
        await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.SaveChangesAsync());

        Assert.Empty(ran);

        // Any later work in the same scope - the same request retrying, a second queue write.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();

        Assert.Empty(ran);
    }

    [Fact]
    public async Task A_Failed_Save_Takes_Back_Only_What_It_Was_Carrying()
    {
        // The first save committed and drained what it carried, so the failure that follows
        // has nothing of its own to confuse with it - and must not reach past its own
        // registrations for anything registered afterwards either.
        var failure = new FailNextSave();
        await using var context = NewContext(failure);
        var (actions, unitOfWork) = Boundary(context);

        var ran = new List<string>();
        ((IPostCommitActions)actions).Enqueue("first", () => ran.Add("first"));
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["first"], ran);

        ((IPostCommitActions)actions).Enqueue("second", () => ran.Add("second"));
        failure.Armed = true;
        context.Settings.Add(NewSetting());
        await Assert.ThrowsAsync<InvalidOperationException>(() => unitOfWork.SaveChangesAsync());

        ((IPostCommitActions)actions).Enqueue("third", () => ran.Add("third"));
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();

        // "second" belonged to the save that threw; "first" had already run once and must not
        // run again; "third" belongs to the save that succeeded.
        Assert.Equal(["first", "third"], ran);
    }

    // ─── the guarantees the above must not have broken ───────────────

    [Fact]
    public async Task Actions_Run_In_Order_And_Exactly_Once()
    {
        await using var context = NewContext();
        var (actions, unitOfWork) = Boundary(context);

        var ran = new List<string>();
        ((IPostCommitActions)actions).Enqueue("a", () => ran.Add("a"));
        ((IPostCommitActions)actions).Enqueue("b", () => ran.Add("b"));
        ((IPostCommitActions)actions).Enqueue("c", () => ran.Add("c"));

        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["a", "b", "c"], ran);

        // A second commit in the same scope has nothing left to say.
        context.Settings.Add(NewSetting());
        await unitOfWork.SaveChangesAsync();
        Assert.Equal(["a", "b", "c"], ran);
    }

    [Fact]
    public async Task An_Effect_That_Throws_Does_Not_Report_The_Commit_As_Failed()
    {
        await using var context = NewContext();
        var (actions, unitOfWork) = Boundary(context);

        var ran = new List<string>();
        ((IPostCommitActions)actions).Enqueue("throws", () => throw new InvalidOperationException("notify failed"));
        ((IPostCommitActions)actions).Enqueue("after", () => ran.Add("after"));

        var setting = NewSetting();
        context.Settings.Add(setting);
        await unitOfWork.SaveChangesAsync();

        // The write is durable, so the request must not be told otherwise - and the rest of
        // the queue still gets its turn.
        Assert.Equal(["after"], ran);
        Assert.NotNull(await context.Settings.AsNoTracking().SingleOrDefaultAsync(s => s.Key == setting.Key));
    }
}
