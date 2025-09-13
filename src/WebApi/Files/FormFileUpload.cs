using Application.Abstractions.Files;

namespace WebApi.Files;

internal sealed class FormFileUpload : IFileUpload
{
    private readonly IFormFile _inner;

    public FormFileUpload(IFormFile inner) => _inner = inner;

    public string FileName => _inner.FileName;
    public string ContentType => _inner.ContentType;
    public long Length => _inner.Length;

    public Stream OpenRead() => _inner.OpenReadStream();

    public Task CopyToAsync(Stream target, CancellationToken cancellationToken = default) =>
        _inner.CopyToAsync(target, cancellationToken);
}