using Application.Abstractions.Storage;

namespace Infrastructure.Storage;

/// <summary>
/// Convention-based file preview storage.
/// Previews are stored at {uploadRoot}/previews/{sha256Hash}.png
/// Channel-specific previews: {uploadRoot}/previews/{sha256Hash}_{channel}.png
/// </summary>
public sealed class FilePreviewService : IFilePreviewService
{
    private readonly IUploadPathProvider _pathProvider;

    public FilePreviewService(IUploadPathProvider pathProvider)
    {
        _pathProvider = pathProvider;
    }

    public string? GetPreviewPath(string sha256Hash)
    {
        var previewPath = BuildPreviewPath(sha256Hash);
        return File.Exists(previewPath) ? previewPath : null;
    }

    public string? GetPreviewPath(string sha256Hash, string channel)
    {
        var previewPath = BuildPreviewPath(sha256Hash, channel);
        return File.Exists(previewPath) ? previewPath : null;
    }

    public async Task SavePreviewAsync(string sha256Hash, Stream content, CancellationToken ct)
    {
        var previewPath = BuildPreviewPath(sha256Hash);
        var directory = Path.GetDirectoryName(previewPath)!;
        Directory.CreateDirectory(directory);

        await using var fileStream = File.Create(previewPath);
        await content.CopyToAsync(fileStream, ct);
    }

    public async Task SavePreviewAsync(string sha256Hash, string channel, Stream content, CancellationToken ct)
    {
        var previewPath = BuildPreviewPath(sha256Hash, channel);
        var directory = Path.GetDirectoryName(previewPath)!;
        Directory.CreateDirectory(directory);

        await using var fileStream = File.Create(previewPath);
        await content.CopyToAsync(fileStream, ct);
    }

    private string BuildPreviewPath(string sha256Hash)
    {
        return Path.Combine(_pathProvider.UploadRootPath, "previews", $"{sha256Hash}.png");
    }

    private string BuildPreviewPath(string sha256Hash, string channel)
    {
        var normalizedChannel = channel.ToLowerInvariant();
        if (normalizedChannel == "rgb")
            return BuildPreviewPath(sha256Hash);
        return Path.Combine(_pathProvider.UploadRootPath, "previews", $"{sha256Hash}_{normalizedChannel}.png");
    }
}
