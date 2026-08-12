using Application.Abstractions.Files;

namespace Application.Files;

/// <summary>
/// In-memory <see cref="IFileUpload"/> backed by a byte buffer. Lets bytes pulled from the
/// store (or any other in-process source) flow through the same content-addressed file
/// pipeline as a real multipart upload (hashing, dedup, storage) without an HTTP round-trip.
/// </summary>
public sealed class InMemoryFileUpload : IFileUpload
{
    private readonly byte[] _bytes;

    public InMemoryFileUpload(string fileName, byte[] bytes, string? contentType = null)
    {
        FileName = fileName;
        _bytes = bytes ?? Array.Empty<byte>();
        ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType;
    }

    public string FileName { get; }
    public string ContentType { get; }
    public long Length => _bytes.Length;

    public Stream OpenRead() => new MemoryStream(_bytes, writable: false);

    public Task CopyToAsync(Stream target, CancellationToken cancellationToken = default)
        => target.WriteAsync(_bytes, 0, _bytes.Length, cancellationToken);
}
