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
/// One boundary answers both questions, and it is the CLAIMED boundary - how many of the
/// queued actions a successful save is already carrying. A FAILED save needs it because
/// callers register before saving (they have to - the effect describes the row the save is
/// about to write), so the only actions it may take back are the ones no earlier save has
/// claimed. A ROLLBACK needs the same number as the baseline it was handed on the way in:
/// see <see cref="ClaimedBoundary"/> for why the raw queue length is the wrong one.
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

    /// <summary>
    /// The baseline a transaction records on the way in, so a rollback can undo exactly what
    /// that transaction is answerable for.
    /// </summary>
    /// <remarks>
    /// The CLAIMED boundary, not the queue length. The queue length looks like the obvious
    /// answer - "everything registered before this transaction began belongs to an earlier
    /// write" - and it is wrong for this queue, because a successful save outside a
    /// transaction DRAINS immediately: an action still sitting here unclaimed is not evidence
    /// of an earlier durable write, it is evidence that its write has not happened yet. The
    /// ordinary handler shape is stage the mutation, enqueue the effect that describes it,
    /// THEN open the transaction that performs it - and the queue length baseline preserved
    /// that effect through the rollback of the very transaction that was supposed to make it
    /// true, for a later unrelated save in the scope to drain.
    /// </remarks>
    public int ClaimedBoundary => _saved;

    /// <summary>
    /// A save's rows have gone down, so everything queued now belongs to a write that exists -
    /// durably, or inside a transaction still open, in which case the write IS in that
    /// transaction and a later failing save must not take these back out.
    /// </summary>
    /// <remarks>
    /// Called from <see cref="SaveDurabilityInterceptor"/>, at the instant EF says the write
    /// landed, and NOT by the commit boundary once the save has returned. The boundary does
    /// not regain control until the whole <c>SavedChangesAsync</c> chain has run, and the next
    /// interceptor in that chain dispatches domain events to handlers that save through this
    /// same scoped unit of work - so a nested save could fail and call
    /// <see cref="DiscardUnsaved"/> while this boundary still read zero, taking the outer
    /// save's effects for a durable row with it. See that class for the full sequence.
    /// </remarks>
    public void MarkSaved() => _saved = _pending.Count;

    /// <summary>
    /// Drops everything no successful save has claimed. This is what a failed
    /// <c>SaveChangesAsync</c> undoes: the effects registered for the write it was about to
    /// make, and nothing that an earlier save in this scope already carried.
    /// </summary>
    public void DiscardUnsaved() => TruncateTo(_saved);

    /// <summary>
    /// Drops everything registered since <paramref name="baseline"/>, which callers take from
    /// <see cref="ClaimedBoundary"/>. A rollback must emit none of the effects the work it
    /// undid asked for, and that includes the ones a nested save already claimed - the saves
    /// made inside a transaction are exactly what the rollback throws away, so this
    /// deliberately overrules <see cref="MarkSaved"/> rather than respecting it.
    /// </summary>
    public void DiscardFrom(int baseline) => TruncateTo(baseline);

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
