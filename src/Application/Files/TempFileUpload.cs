using Application.Abstractions.Files;

namespace Application.Files;

/// <summary>
/// <see cref="IFileUpload"/> backed by a file on disk (a store download parked in a temp
/// file). Lets GB-sized pulled files flow through the same content-addressed pipeline as a
/// real multipart upload without ever holding the payload in memory. Does not own the file's
/// lifetime — the creator (e.g. <c>StoreDownloadedFile</c>) deletes it.
/// </summary>
public sealed class TempFileUpload : IFileUpload
{
    private readonly string _path;

    public TempFileUpload(string path, string fileName, string? contentType = null)
    {
        _path = path;
        FileName = fileName;
        ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType;
    }

    public string FileName { get; }
    public string ContentType { get; }
    public long Length => new FileInfo(_path).Length;

    public Stream OpenRead()
        => new FileStream(_path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);

    public async Task CopyToAsync(Stream target, CancellationToken cancellationToken = default)
    {
        await using var source = OpenRead();
        await source.CopyToAsync(target, cancellationToken);
    }
}
