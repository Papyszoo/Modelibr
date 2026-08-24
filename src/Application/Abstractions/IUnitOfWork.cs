using SharedKernel;

namespace Application.Abstractions;

/// <summary>
/// Commits all pending changes tracked across this request's repositories in a
/// single database transaction. Repositories only stage mutations (Add/Update/
/// Remove) on the shared <c>ApplicationDbContext</c> - they no longer call
/// SaveChanges themselves. Command handlers that touch more than one
/// repository call <see cref="SaveChangesAsync"/> exactly once, after all
/// mutations have been staged, so the whole operation commits or rolls back
/// atomically.
/// </summary>
public interface IUnitOfWork
{
    /// <summary>
    /// Persists all staged changes. Implemented by <c>ApplicationDbContext</c>,
    /// which also collects and dispatches domain events raised by tracked
    /// aggregates after a successful commit (see
    /// <c>Infrastructure.Persistence.DomainEventsInterceptor</c>).
    /// </summary>
    Task SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Runs <paramref name="work"/> inside <b>one</b> database transaction, committing only
    /// if it returns a success <see cref="Result{T}"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// For the handlers that cannot express their write as a single staged unit - the
    /// metadata patch calls a family's own command handlers, each of which commits through
    /// the unit-of-work decorator, and then writes a side table of its own. Those commits are
    /// individually correct and collectively not atomic: a patch carrying tags and an
    /// over-long licence name committed the tags and then failed, leaving half a patch
    /// durable and an error saying nothing had been written.
    /// </para>
    /// <para>
    /// An ambient transaction is what makes the nested saves stop being independently
    /// durable: EF joins each <see cref="SaveChangesAsync"/> to the open transaction rather
    /// than opening its own, so the whole patch lands or none of it does. A failure Result
    /// rolls back exactly like a thrown exception - a handler that reports "nothing was
    /// written" must be telling the truth.
    /// </para>
    /// <para>
    /// Re-entrant: when a transaction is already open on this unit of work, the work simply
    /// joins it rather than nesting a second one, so an outer boundary keeps its meaning.
    /// </para>
    /// </remarks>
    Task<Result<T>> InTransactionAsync<T>(
        Func<CancellationToken, Task<Result<T>>> work,
        CancellationToken cancellationToken = default);
}
