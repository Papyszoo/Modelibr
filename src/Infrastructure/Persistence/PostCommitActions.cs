using Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Persistence;

/// <summary>
/// The scoped queue behind <see cref="IPostCommitActions"/>, plus the two operations only the
/// commit boundary is allowed to perform: draining it, and discarding what a rolled-back
/// transaction had registered.
/// </summary>
/// <remarks>
/// Scoped, so its lifetime is one request/one operation, and anything still queued when the
/// scope ends is simply dropped - which is the correct answer for a handler that failed
/// before reaching a commit. The drain is driven by <see cref="PostCommitUnitOfWork"/>.
/// </remarks>
internal sealed class PostCommitActions : IPostCommitActions
{
    private readonly List<(string Description, Func<CancellationToken, Task> Run)> _pending = [];
    private readonly ILogger<PostCommitActions> _logger;

    public PostCommitActions(ILogger<PostCommitActions> logger)
    {
        _logger = logger;
    }

    public void Enqueue(string description, Func<CancellationToken, Task> action)
        => _pending.Add((description, action));

    public void Enqueue(string description, Action action)
        => _pending.Add((description, _ =>
        {
            action();
            return Task.CompletedTask;
        }));

    /// <summary>How many actions are registered, so a transaction can undo exactly its own.</summary>
    public int Mark => _pending.Count;

    /// <summary>
    /// Drops everything registered since <paramref name="mark"/>. A rollback must emit none of
    /// the effects the work inside it asked for - and only those: an action registered earlier
    /// in the scope belongs to a write that already committed.
    /// </summary>
    public void DiscardFrom(int mark)
    {
        if (mark < _pending.Count)
        {
            _pending.RemoveRange(mark, _pending.Count - mark);
        }
    }

    /// <summary>
    /// Runs every registered action, in order, and clears the queue.
    /// </summary>
    /// <remarks>
    /// The queue is emptied BEFORE the first action runs. An action that itself writes and
    /// commits (the thumbnail notification does not, but nothing stops one) would otherwise
    /// re-enter this and run the remainder twice.
    /// </remarks>
    public async Task RunPendingAsync(CancellationToken cancellationToken)
    {
        if (_pending.Count == 0)
        {
            return;
        }

        var draining = _pending.ToArray();
        _pending.Clear();

        foreach (var (description, run) in draining)
        {
            try
            {
                await run(cancellationToken);
            }
            catch (Exception ex)
            {
                // The write is durable; this is the notification about it. Failing the
                // request now would report a rollback that did not happen.
                _logger.LogWarning(ex, "Post-commit action '{Action}' failed", description);
            }
        }
    }
}
