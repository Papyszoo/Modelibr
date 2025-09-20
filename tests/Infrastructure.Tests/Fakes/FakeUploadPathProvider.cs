using Application.Abstractions.Storage;

namespace Infrastructure.Tests.Fakes;

internal sealed class FakeUploadPathProvider : IUploadPathProvider
{
    public string UploadRootPath { get; }
    public FakeUploadPathProvider(string root) => UploadRootPath = root;
}