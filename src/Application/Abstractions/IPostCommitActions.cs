namespace Application.Abstractions;

/// <summary>
/// Side effects that must not happen until the enclosing database transaction has committed.
/// </summary>
/// <remarks>
/// <para>
/// A command handler that invalidates a cache, enqueues background work or notifies a worker
/// is making a promise about state another process is about to go and read. Making it inside
/// the write is making it early: the consumer opens its own database scope, sees the state
/// from BEFORE the transaction, and acts on it - and if the transaction then rolls back, the
/// effect happened for a write that never existed.
/// </para>
/// <para>
/// <c>bind_texture_set</c> is where this bit. It runs two command handlers inside one
/// transaction, and each of them invalidated the generated <c>.blend</c> cache and enqueued a
/// regeneration as it went. The blend consumer is a singleton with its own scope factory, so
/// it could take the queue entry, read the OLD committed bindings, and write a cached
/// <c>.blend</c> built from them - which the duplicate entry that followed then found already
/// present and returned. A rollback emitted the same effects for a bind that never landed.
/// </para>
/// <para>
/// Actions run once, in the order they were enqueued, after the outermost
/// <see cref="IUnitOfWork"/> boundary in this scope has committed. A rollback discards
/// everything enqueued inside it. Nothing here can fail a request: an action that throws is
/// logged and the rest still run - these are notifications and cache maintenance, and the
/// write they describe is already durable by the time they are asked for.
/// </para>
/// </remarks>
public interface IPostCommitActions
{
    /// <summary>
    /// Registers <paramref name="action"/> to run once the enclosing write has committed.
    /// </summary>
    /// <param name="description">
    /// What the action is, for the log when it throws. Not a key - two identical descriptions
    /// are two actions.
    /// </param>
    void Enqueue(string description, Func<CancellationToken, Task> action);

    /// <summary>The synchronous overload, for effects that are not I/O (a cache delete, a channel write).</summary>
    void Enqueue(string description, Action action);
}
