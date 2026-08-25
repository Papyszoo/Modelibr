using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Infrastructure.Persistence;

/// <summary>
/// The internal durability signal the commit boundary runs on: it counts the moments at which
/// this scope's writes actually became state another connection can read.
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
/// Scoped (registered in <c>AddInfrastructure</c>), like the queue it informs: the counters
/// describe one request's writes and must not leak across scopes. They only ever increase, so
/// the boundary compares a value it captured before the call rather than reading a flag
/// somebody has to remember to reset - which also keeps the recursive save
/// <see cref="DomainEventsInterceptor"/> makes from confusing it.
/// </para>
/// </remarks>
public sealed class SaveDurabilityInterceptor : SaveChangesInterceptor, IDbTransactionInterceptor
{
    private int _persisted;
    private int _committed;

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
        return result;
    }

    public override ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        _persisted++;
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
