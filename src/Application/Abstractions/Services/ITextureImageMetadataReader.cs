using DomainFile = Domain.Models.File;

namespace Application.Abstractions.Services;

/// <summary>
/// Reads source-image metadata (pixel dimensions and format) directly from an
/// uploaded texture file on the backend.
///
/// Universal (Global Material) texture sets get this metadata from the worker as a
/// side effect of their thumbnail/proxy job. Non-Universal sets (Multi-Model /
/// Single-Model) never get a worker pass, so their resolution is captured here at
/// upload time instead. Best-effort: returns <c>null</c> when the file cannot be
/// read or decoded, so a metadata failure never blocks the upload.
/// </summary>
public interface ITextureImageMetadataReader
{
    Task<TextureImageMetadata?> ReadAsync(DomainFile file, CancellationToken cancellationToken = default);
}

/// <summary>Pixel dimensions and optional format name of a texture's source image.</summary>
public sealed record TextureImageMetadata(int Width, int Height, string? Format);
