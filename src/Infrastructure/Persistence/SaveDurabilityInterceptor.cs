using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Infrastructure.Persistence;

/// <summary>
/// The internal durability signal the commit boundary runs on: it counts the moments at which
/// this scope's writes actually became state another connection can read, and hands the
/// post-commit queue over to the save that just reached one.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="PostCommitUnitOfWork"/> cannot learn this from the exception a
/// <c>SaveChangesAsync</c> throws. EF's order for a save with no explicit transaction open is:
/// the <c>SavingChangesAsync</c> interceptors, then the provider write - which, for an
/// implicit transaction, includes the COMMIT - and only then the <c>SavedChangesAsync</c>
/// interceptors. A throw from that last stage is a throw from an already durable save, and it
/// reaches the caller looking exactly like a throw from the first stage, which persisted
/// nothing. Discarding the queued effects for both is what lost a notification for a row that
/// is sitting in the table.
/// </para>
/// <para>
/// So the signal is taken at the only place that can only be reached once the write landed:
/// <see cref="SavedChangesAsync"/>. EF composes the registered interceptors in REGISTRATION
/// ORDER and stops the chain at the first one that throws, so this must be registered FIRST -
/// ahead of <see cref="DomainEventsInterceptor"/> and ahead of anything a test adds - or a
/// later interceptor's failure hides the very fact this exists to record. That ordering is
/// pinned in <c>Infrastructure/DependencyInjection.cs</c> and covered by
/// <c>PostCommitUnitOfWorkTests</c> and <c>PostCommitBoundaryIntegrationTests</c>.
/// </para>
/// <para>
/// <c>SaveChangesFailedAsync</c> is deliberately NOT the signal: EF raises it for every
/// interceptor whenever the save throws, including when the throw came from
/// <c>SavedChangesAsync</c> after the commit, so it cannot tell the two apart either.
/// </para>
/// <para>
/// <see cref="TransactionCommittedAsync"/> covers the other boundary - an EXPLICIT transaction,
/// where the save is not the durability point and the COMMIT is. It is not a substitute for the
/// save signal: with EF's default <c>AutoTransactionBehavior.WhenNeeded</c> a save whose work
/// fits one command batch is sent without any transaction at all, so no transaction callback
/// ever fires for the case this class was written for.
/// </para>
/// <para>
/// THE CLAIM HAPPENS HERE, NOT IN THE DECORATOR, and that is the whole reason this class owns
/// a reference to the queue. <see cref="PostCommitUnitOfWork"/> only regains control after the
/// ENTIRE <c>SavedChangesAsync</c> chain has run - and the next interceptor in that chain
/// dispatches domain events, whose handlers save through the same scoped unit of work. A
/// nested save that is then refused asks the queue what it may take back, and the answer used
/// to be "everything", because the outer save had not yet been able to say which actions were
/// already its own: the outer save's effect was discarded for a row that is on disk, and the
/// handler converting its own failure (<c>ModelUploadedEventHandler</c> converts every
/// exception it can produce) let the outer save return normally over the emptied queue.
/// So the queue's boundary moves at the instant durability is known, which is this callback,
/// before anything that could re-enter the unit of work gets its turn. What it claims is
/// exactly the prefix this save is answerable for: every action queued at this moment was
/// registered before this save's rows went down - callers enqueue before saving, because the
/// action describes the row the save is about to write - and nothing else can have been
/// registered since, because no application code runs between the decorator's call and here.
/// A nested save reaching this point claims its own, longer prefix the same way, so the two
/// never collide.
/// </para>
/// <para>
/// Scoped (registered in <c>AddInfrastructure</c>), like the queue it informs: the counters
/// describe one request's writes and must not leak across scopes. They only ever increase, so
/// the boundary compares a value it captured before the call rather than reading a flag
/// somebody has to remember to reset - which also keeps the recursive save
/// <see cref="DomainEventsInterceptor"/> makes from confusing it.
/// </para>
/// </remarks>
public sealed class SaveDurabilityInterceptor : SaveChangesInterceptor, IDbTransactionInterceptor
{
    private readonly PostCommitActions _actions;

    private int _persisted;
    private int _committed;

    /// <remarks>
    /// Internal, so <c>AddInfrastructure</c> has to construct it through a factory rather than
    /// by reflection - the queue is internal too, and this pairing is not something outside
    /// this assembly has any business assembling.
    /// </remarks>
    internal SaveDurabilityInterceptor(PostCommitActions actions)
    {
        _actions = actions;
    }

    /// <summary>
    /// How many saves in this scope have reached the point where their rows are written. With
    /// no explicit transaction open that point IS durability; inside one it means the write is
    /// in the transaction, and the commit below decides.
    /// </summary>
    internal int Persisted => _persisted;

    /// <summary>How many explicit transactions in this scope have committed.</summary>
    internal int Committed => _committed;

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        _persisted++;
        _actions.MarkSaved();
        return result;
    }

    public override ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        _persisted++;
        _actions.MarkSaved();
        return ValueTask.FromResult(result);
    }

    void IDbTransactionInterceptor.TransactionCommitted(DbTransaction transaction, TransactionEndEventData eventData)
        => _committed++;

    Task IDbTransactionInterceptor.TransactionCommittedAsync(
        DbTransaction transaction,
        TransactionEndEventData eventData,
        CancellationToken cancellationToken)
    {
        _committed++;
        return Task.CompletedTask;
    }
}
