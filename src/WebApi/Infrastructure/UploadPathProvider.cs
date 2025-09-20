using Application.Abstractions.Storage;

namespace WebApi.Infrastructure;

public sealed class UploadPathProvider : IUploadPathProvider
{
    public string UploadRootPath { get; }

    public UploadPathProvider(IConfiguration configuration)
    {
        UploadRootPath = configuration["UPLOAD_STORAGE_PATH"] ?? "/var/lib/modelibr/uploads";
    }
}