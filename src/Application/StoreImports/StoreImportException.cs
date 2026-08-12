namespace Application.StoreImports;

/// <summary>
/// Thrown for a per-item import failure (download error, hash mismatch, a rejected command
/// handler Result, etc.). The processor catches it per item so one failure records a
/// "failed" outcome without aborting the pack. When the failure originated from a command
/// handler's Result, <see cref="ErrorCode"/> carries the domain error code so callers can
/// branch on it without matching message strings.
/// </summary>
public sealed class StoreImportException : Exception
{
    /// <summary>The domain <c>Error.Code</c> this failure originated from, or null.</summary>
    public string? ErrorCode { get; }

    public StoreImportException(string message) : base(message) { }

    public StoreImportException(string message, Exception inner) : base(message, inner) { }

    private StoreImportException(string errorCode, string message) : base($"{errorCode}: {message}")
    {
        ErrorCode = errorCode;
    }

    public static StoreImportException FromError(string errorCode, string message)
        => new(errorCode, message);
}
