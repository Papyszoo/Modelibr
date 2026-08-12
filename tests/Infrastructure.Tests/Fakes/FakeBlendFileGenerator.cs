using Application.Abstractions.Services;

namespace Infrastructure.Tests.Fakes;

/// <summary>
/// Minimal IBlendFileGenerator test double that mirrors BlendFileGenerator's real on-disk
/// cache contract (a file at {cacheDir}/{modelId}-v{versionId}.blend) without needing a
/// real Blender install. Tests control readiness purely by writing/deleting files under
/// CacheDir - exactly the signal VirtualGeneratedBlendFile.TryCreate reads through
/// GetCachedSizeBytes.
/// </summary>
internal sealed class FakeBlendFileGenerator : IBlendFileGenerator
{
    public string CacheDir { get; }
    public bool IsAvailable { get; set; } = true;
    public int GetOrGenerateCallCount { get; private set; }

    public FakeBlendFileGenerator(string uploadRoot)
    {
        CacheDir = Path.Combine(uploadRoot, "generated-blend");
        Directory.CreateDirectory(CacheDir);
    }

    private string GetCachePath(int modelId, int versionId) =>
        Path.Combine(CacheDir, $"{modelId}-v{versionId}.blend");

    /// <summary>Simulates a completed background generation by writing the cache file directly.</summary>
    public void WriteCachedFile(int modelId, int versionId, byte[] content) =>
        File.WriteAllBytes(GetCachePath(modelId, versionId), content);

    public long? GetCachedSizeBytes(int modelId, int versionId)
    {
        var path = GetCachePath(modelId, versionId);
        return File.Exists(path) ? new FileInfo(path).Length : null;
    }

    public void InvalidateCache(int modelId, int versionId)
    {
        var path = GetCachePath(modelId, versionId);
        if (File.Exists(path))
            File.Delete(path);
    }

    public Task<GeneratedBlendInfo?> GetOrGenerateAsync(int modelId, int versionId, CancellationToken cancellationToken = default)
    {
        GetOrGenerateCallCount++;
        var size = GetCachedSizeBytes(modelId, versionId);
        if (size == null)
            return Task.FromResult<GeneratedBlendInfo?>(null);

        return Task.FromResult<GeneratedBlendInfo?>(
            new GeneratedBlendInfo(GetCachePath(modelId, versionId), size.Value, DateTime.UtcNow));
    }
}
