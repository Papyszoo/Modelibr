namespace Application.Abstractions.Services;

/// <summary>
/// Service for acquiring transaction-scoped advisory locks during store imports.
/// </summary>
public interface IStoreImportLockService
{
    /// <summary>
    /// Acquires a transaction-scoped advisory lock for the given string key.
    /// The lock is automatically released when the active transaction commits or rolls back.
    /// </summary>
    /// <param name="key">Unique key string to lock on (e.g. store item provenance or file SHA)</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task AcquireLockAsync(string key, CancellationToken cancellationToken = default);
}
