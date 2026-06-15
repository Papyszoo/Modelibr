using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Infrastructure.Images;
using Microsoft.Extensions.Logging;
using DomainFile = Domain.Models.File;

namespace Infrastructure.Services;

internal sealed class TextureImageMetadataReader : ITextureImageMetadataReader
{
    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger<TextureImageMetadataReader> _logger;

    public TextureImageMetadataReader(
        IUploadPathProvider pathProvider,
        ILogger<TextureImageMetadataReader> logger)
    {
        _pathProvider = pathProvider;
        _logger = logger;
    }

    public async Task<TextureImageMetadata?> ReadAsync(DomainFile file, CancellationToken cancellationToken = default)
    {
        if (file is null || string.IsNullOrWhiteSpace(file.FilePath))
            return null;

        var fullPath = Path.Combine(_pathProvider.UploadRootPath, file.FilePath);

        try
        {
            if (!System.IO.File.Exists(fullPath))
                return null;

            var dimensions = await ImageDimensionReader.ReadAsync(fullPath, cancellationToken);
            if (dimensions.Width <= 0 || dimensions.Height <= 0)
                return null;

            return new TextureImageMetadata(dimensions.Width, dimensions.Height, dimensions.Format);
        }
        catch (Exception ex)
        {
            // Best-effort: a format we can't decode, or a transient read error, must
            // never fail the upload — the texture's resolution simply stays null.
            _logger.LogWarning(ex, "Could not read texture image metadata for file {FileId} at {Path}", file.Id, fullPath);
            return null;
        }
    }
}
