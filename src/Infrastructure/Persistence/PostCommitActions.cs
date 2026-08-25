using Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Persistence;

/// <summary>
/// The scoped queue behind <see cref="IPostCommitActions"/>, plus the operations only the
/// commit boundary is allowed to perform: draining it, and discarding what a failed save or a
/// rolled-back transaction had registered.
/// </summary>
/// <remarks>
/// <para>
/// Scoped, so its lifetime is one request/one operation, and anything still queued when the
/// scope ends is simply dropped - which is the correct answer for a handler that failed
/// before reaching a commit. The drain is driven by <see cref="PostCommitUnitOfWork"/>.
/// </para>
/// <para>
/// Two boundaries, not one, because they answer different questions. <see cref="Mark"/> is
/// "where did this transaction start", used to undo a rollback's registrations.
/// <see cref="MarkSaved"/>/<see cref="DiscardUnsaved"/> track "which of these has a save
/// behind it", which is what a FAILED save needs: callers register before saving (they have
/// to - the effect describes the row the save is about to write), so the only actions a
/// failed save may take back are the ones no earlier save has claimed.
/// </para>
/// </remarks>
internal sealed class PostCommitActions : IPostCommitActions
{
    private readonly List<(string Description, Func<CancellationToken, Task> Run)> _pending = [];
    private readonly ILogger<PostCommitActions> _logger;

    /// <summary>
    /// How many of the queued actions a successful save has already claimed. Everything below
    /// this index describes a write that landed - durably, or into a transaction still open;
    /// everything from it up is riding on a save that has not happened yet.
    /// </summary>
    private int _saved;

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
    /// A save succeeded, so everything queued now belongs to a write that exists. Called for a
    /// save that joined an open transaction: the write is not durable yet, but it IS in the
    /// transaction, so a later failing save in the same scope must not take these back out.
    /// </summary>
    public void MarkSaved() => _saved = _pending.Count;

    /// <summary>
    /// Drops everything no successful save has claimed. This is what a failed
    /// <c>SaveChangesAsync</c> undoes: the effects registered for the write it was about to
    /// make, and nothing that an earlier save in this scope already carried.
    /// </summary>
    public void DiscardUnsaved() => TruncateTo(_saved);

    /// <summary>
    /// Drops everything registered since <paramref name="mark"/>. A rollback must emit none of
    /// the effects the work inside it asked for - and only those: an action registered earlier
    /// in the scope belongs to a write that already committed. This ignores
    /// <see cref="MarkSaved"/>, deliberately: the saves made inside a transaction are exactly
    /// the ones the rollback throws away.
    /// </summary>
    public void DiscardFrom(int mark) => TruncateTo(mark);

    /// <summary>
    /// Runs every registered action, in order, and clears the queue.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The queue is emptied BEFORE the first action runs. An action that itself writes and
    /// commits (the thumbnail notification does not, but nothing stops one) would otherwise
    /// re-enter this and run the remainder twice.
    /// </para>
    /// <para>
    /// No token parameter, deliberately. This only ever runs after the write is durable, and
    /// the caller's token stopped meaning anything at that moment - it used to be passed
    /// through, and a request cancelled in the instant after the commit therefore handed every
    /// effect a token already cancelled: the thumbnail notification threw
    /// <see cref="OperationCanceledException"/>, was logged away here, and the job sat in the
    /// table with no worker told about it. Taking the parameter away is what stops a future
    /// caller reintroducing that; if these ever need to be interruptible it should be by an
    /// application-lifetime token owned here, never by the request's.
    /// </para>
    /// </remarks>
    public async Task RunPendingAsync()
    {
        if (_pending.Count == 0)
        {
            _saved = 0;
            return;
        }

        var draining = _pending.ToArray();
        _pending.Clear();
        _saved = 0;

        foreach (var (description, run) in draining)
        {
            try
            {
                await run(CancellationToken.None);
            }
            catch (Exception ex)
            {
                // The write is durable; this is the notification about it. Failing the
                // request now would report a rollback that did not happen.
                _logger.LogWarning(ex, "Post-commit action '{Action}' failed", description);
            }
        }
    }

    private void TruncateTo(int index)
    {
        if (index < _pending.Count)
        {
            _pending.RemoveRange(index, _pending.Count - index);
        }

        if (_saved > _pending.Count)
        {
            _saved = _pending.Count;
        }
    }
}
