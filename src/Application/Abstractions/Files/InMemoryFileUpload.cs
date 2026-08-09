namespace Application.Abstractions.Files;

/// <summary>
/// An <see cref="IFileUpload"/> backed by an in-memory byte buffer. Used when the source
/// bytes don't come from an HTTP form part — e.g. entries extracted from an uploaded
/// <c>.zip</c> during multi-file glTF import.
/// </summary>
public sealed class InMemoryFileUpload : IFileUpload
{
    private readonly byte[] _content;

    public InMemoryFileUpload(string fileName, byte[] content, string contentType = "application/octet-stream")
    {
        FileName = fileName ?? throw new ArgumentNullException(nameof(fileName));
        _content = content ?? throw new ArgumentNullException(nameof(content));
        ContentType = contentType;
    }

    public string FileName { get; }
    public string ContentType { get; }
    public long Length => _content.LongLength;

    public Stream OpenRead() => new MemoryStream(_content, writable: false);

    public Task CopyToAsync(Stream target, CancellationToken cancellationToken = default) =>
        target.WriteAsync(_content, 0, _content.Length, cancellationToken);
}
