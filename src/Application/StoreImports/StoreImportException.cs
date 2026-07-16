namespace Application.StoreImports;

/// <summary>
/// Thrown for a per-item import failure (download error, hash mismatch, a rejected command
/// handler Result, etc.). The processor catches it per item so one failure records a
/// "failed" outcome without aborting the pack.
/// </summary>
public sealed class StoreImportException : Exception
{
    public StoreImportException(string message) : base(message) { }
    public StoreImportException(string message, Exception inner) : base(message, inner) { }
}
