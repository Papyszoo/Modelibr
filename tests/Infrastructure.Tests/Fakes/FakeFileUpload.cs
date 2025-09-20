using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Application.Abstractions.Files;

namespace Infrastructure.Tests.Fakes;

internal sealed class FakeFileUpload : IFileUpload
{
    private readonly byte[] _data;

    public string FileName { get; }
    public string ContentType { get; }
    public long Length => _data.LongLength;

    public FakeFileUpload(string fileName, byte[] data, string contentType = "application/octet-stream")
    {
        FileName = fileName;
        _data = data;
        ContentType = contentType;
    }

    public Task CopyToAsync(Stream target, CancellationToken ct) =>
        target.WriteAsync(_data, 0, _data.Length, ct);

    public Stream OpenRead() => new MemoryStream(_data, writable: false);
}