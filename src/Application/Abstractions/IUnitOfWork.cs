namespace Application.Abstractions;

/// <summary>
/// Commits all pending changes tracked across this request's repositories in a
/// single database transaction. Repositories only stage mutations (Add/Update/
/// Remove) on the shared <c>ApplicationDbContext</c> — they no longer call
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
}
