using Application.Abstractions;
using SharedKernel;

namespace Infrastructure.Persistence;

/// <summary>
/// The unit of work every handler injects: <see cref="ApplicationDbContext"/>'s commit
/// behaviour, plus the point at which <see cref="IPostCommitActions"/> is drained.
/// </summary>
/// <remarks>
/// <para>
/// The drain belongs at the OUTERMOST boundary and nowhere else. A nested
/// <c>SaveChangesAsync</c> made while a transaction is open has not committed anything - EF
/// joined it to the open transaction - so draining there would be the bug this exists to fix,
/// one level down. The test is <c>Database.CurrentTransaction</c>, which is the same thing
/// <see cref="ApplicationDbContext"/> itself uses to decide whether to nest.
/// </para>
/// <para>
/// Why a decorator rather than more code in the context: the context is registered by
/// <c>AddDbContext</c> and constructed by EF, and the effects queue is a scoped collaborator
/// with nothing to do with persistence configuration. Wrapping keeps the context's
/// constructor as EF expects it and keeps "when do side effects fire" in one readable place.
/// A caller that resolves <c>ApplicationDbContext</c> directly and saves through it bypasses
/// the drain - which is harmless, because such a caller has no way to enqueue an action
/// either; <see cref="IPostCommitActions"/> is only reachable from the handlers that inject it.
/// </para>
/// <para>
/// A THROW IS NOT A ROLLBACK. This used to assume it was, and discarded the queued effects for
/// every <c>SaveChangesAsync</c> that threw. EF runs the <c>SavedChangesAsync</c> interceptors
/// AFTER the provider write, which for an implicit transaction is after the COMMIT - and
/// <see cref="DomainEventsInterceptor"/> does real, cancellable, asynchronous work there. A
/// throw from that stage described a row that is durable, and the effect describing it was
/// thrown away: a thumbnail job written to the table with no worker ever told about it.
/// <see cref="SaveDurabilityInterceptor"/> is the signal that separates the two, and the two
/// failures get opposite answers - discard before persistence, settle after it - while the
/// exception itself propagates unchanged either way.
/// </para>
/// <para>
/// CANCELLATION: the caller's token governs the write. Once the write is durable it governs
/// nothing - the effects describe state another process can already read, and dropping them
/// because the client hung up loses a notification whose durable job is still sitting in the
/// table waiting to be told about. So the drain takes no token at all; see
/// <see cref="PostCommitActions.RunPendingAsync"/>. It still cannot fail the request: that
/// method logs and continues, because reporting an error here would describe a rollback that
/// did not happen. That covers a post-commit cancellation too - a token cancelled between the
/// COMMIT and the <c>SavedChangesAsync</c> interceptors makes the save throw
/// <c>OperationCanceledException</c> over a durable row, which is the post-commit failure
/// above and not a rollback.
/// </para>
/// </remarks>
internal sealed class PostCommitUnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private readonly PostCommitActions _actions;
    private readonly SaveDurabilityInterceptor _durability;

    public PostCommitUnitOfWork(
        ApplicationDbContext context,
        PostCommitActions actions,
        SaveDurabilityInterceptor durability)
    {
        _context = context;
        _actions = actions;
        _durability = durability;
    }

    private IUnitOfWork Inner => _context;

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var persistedBefore = _durability.Persisted;

        try
        {
            await Inner.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            if (_durability.Persisted > persistedBefore)
            {
                // The rows landed and something after them threw: a post-save interceptor, or
                // one of them observing the request's token. The write exists, so its effects
                // are owed exactly as if the save had returned normally. The exception still
                // reaches the caller untouched - the only thing settled here is the queue.
                await SettleAsync();
            }
            else
            {
                // Nothing this save staged exists, so neither may the effects registered for
                // it. Callers enqueue BEFORE saving on purpose - the action describes the row
                // the save is about to write - which is exactly why leaving the queue alone
                // here was wrong: the next successful save in this scope would have drained a
                // notification for a job that was never written. Only the unclaimed tail goes;
                // an action an earlier save already carried belongs to a write this failure
                // did not touch.
                _actions.DiscardUnsaved();
            }

            throw;
        }

        await SettleAsync();
    }

    public async Task<Result<T>> InTransactionAsync<T>(
        Func<CancellationToken, Task<Result<T>>> work,
        CancellationToken cancellationToken = default)
    {
        // Joining an outer transaction rather than opening one - so the outer boundary owns
        // both the commit and the drain, exactly as it owns the rollback.
        var joined = _context.Database.CurrentTransaction is not null;

        // The baseline a rollback undoes to. It is the CLAIMED boundary, not the queue length:
        // an action enqueued in the breath before this call is the effect that describes the
        // write this transaction is here to perform, so this transaction's verdict is what
        // decides it. Treating it as somebody else's already-committed work let a rolled-back
        // bind survive for the next save in the scope to drain - see
        // PostCommitActions.ClaimedBoundary.
        var baseline = _actions.ClaimedBoundary;
        var committedBefore = _durability.Committed;

        Result<T> result;
        try
        {
            result = await Inner.InTransactionAsync(work, cancellationToken);
        }
        catch
        {
            if (!joined)
            {
                if (_durability.Committed > committedBefore)
                {
                    // COMMIT returned and the throw came from after it. Same rule as a save
                    // that throws once its rows are down: the transaction is durable, so the
                    // effects describing it are owed.
                    await _actions.RunPendingAsync();
                }
                else
                {
                    _actions.DiscardFrom(baseline);
                }
            }

            throw;
        }

        if (joined)
        {
            return result;
        }

        if (result.IsFailure)
        {
            // A failure Result rolls the transaction back, so the effects it asked for
            // describe a write that does not exist.
            _actions.DiscardFrom(baseline);
            return result;
        }

        await _actions.RunPendingAsync();
        return result;
    }

    /// <summary>
    /// What a save whose rows went down owes the queue, whichever way it returned.
    /// </summary>
    /// <remarks>
    /// Inside an explicit transaction the rows are written but not durable, and the boundary
    /// that owns the transaction drains when it commits - but the write IS in that transaction
    /// now, so a later failing save must no longer be able to discard what this one carried.
    /// With no transaction open the save itself was the commit, so the effects run here.
    /// The claim itself has already happened by the time this runs:
    /// <see cref="SaveDurabilityInterceptor"/> makes it at the moment the rows land, because
    /// domain-event dispatch can re-enter this unit of work before control gets back here.
    /// Repeating it costs nothing and still answers the one case EF never reports a write for -
    /// a save with nothing staged.
    /// </remarks>
    private Task SettleAsync()
    {
        if (_context.Database.CurrentTransaction is not null)
        {
            _actions.MarkSaved();
            return Task.CompletedTask;
        }

        return _actions.RunPendingAsync();
    }
}
