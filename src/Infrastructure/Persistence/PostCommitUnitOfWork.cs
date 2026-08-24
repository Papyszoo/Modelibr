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
/// </remarks>
internal sealed class PostCommitUnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private readonly PostCommitActions _actions;

    public PostCommitUnitOfWork(ApplicationDbContext context, PostCommitActions actions)
    {
        _context = context;
        _actions = actions;
    }

    private IUnitOfWork Inner => _context;

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await Inner.SaveChangesAsync(cancellationToken);

        // Inside a transaction this save is not durable yet, and the boundary that owns the
        // transaction will drain when it commits.
        if (_context.Database.CurrentTransaction is null)
        {
            await _actions.RunPendingAsync(cancellationToken);
        }
    }

    public async Task<Result<T>> InTransactionAsync<T>(
        Func<CancellationToken, Task<Result<T>>> work,
        CancellationToken cancellationToken = default)
    {
        // Joining an outer transaction rather than opening one - so the outer boundary owns
        // both the commit and the drain, exactly as it owns the rollback.
        var joined = _context.Database.CurrentTransaction is not null;
        var mark = _actions.Mark;

        Result<T> result;
        try
        {
            result = await Inner.InTransactionAsync(work, cancellationToken);
        }
        catch
        {
            if (!joined)
            {
                _actions.DiscardFrom(mark);
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
            _actions.DiscardFrom(mark);
            return result;
        }

        await _actions.RunPendingAsync(cancellationToken);
        return result;
    }
}
