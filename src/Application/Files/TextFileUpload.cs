using System.Text;
using Application.Abstractions.Files;

namespace Application.Files;

/// <summary>
/// In-memory <see cref="IFileUpload"/> backed by a UTF-8 text payload. Lets edited
/// script content flow through the same content-addressed file pipeline as a real
/// upload (hashing, dedup, storage) without a multipart round-trip.
/// </summary>
public sealed class TextFileUpload : IFileUpload
{
    private readonly byte[] _bytes;

    public TextFileUpload(string fileName, string content, string contentType = "text/plain")
    {
        FileName = fileName;
        ContentType = contentType;
        _bytes = Encoding.UTF8.GetBytes(content ?? string.Empty);
    }

    public string FileName { get; }
    public string ContentType { get; }
    public long Length => _bytes.Length;

    public Stream OpenRead() => new MemoryStream(_bytes, writable: false);

    public Task CopyToAsync(Stream target, CancellationToken cancellationToken = default)
        => target.WriteAsync(_bytes, 0, _bytes.Length, cancellationToken);
}
