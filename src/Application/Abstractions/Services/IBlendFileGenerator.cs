namespace Application.Abstractions.Services;

public record GeneratedBlendInfo(string FilePath, long SizeBytes, DateTime GeneratedAt);

public interface IBlendFileGenerator
{
    /// <summary>
    /// Whether Blender CLI is available for .blend file generation.
    /// </summary>
    bool IsAvailable { get; }

    /// <summary>
    /// Gets an existing cached .blend file or generates a new one from the model version's
    /// renderable file with material preset textures applied.
    /// Returns null if generation is not possible (no Blender, no renderable file, etc.).
    /// </summary>
    Task<GeneratedBlendInfo?> GetOrGenerateAsync(int modelId, int versionId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the cached .blend file size in bytes if it exists, null otherwise.
    /// Lightweight — only checks the file system, does not trigger generation.
    /// </summary>
    long? GetCachedSizeBytes(int modelId, int versionId);

    /// <summary>
    /// Deletes the cached .blend file for the given model version so it will be regenerated on next access.
    /// </summary>
    void InvalidateCache(int modelId, int versionId);
}
