using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

public sealed class BlendFileGenerator : IBlendFileGenerator
{
    private readonly IBlenderInstallationService _blenderService;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger<BlendFileGenerator> _logger;
    private readonly string _scriptPath;
    private readonly SemaphoreSlim _generationLock = new(1, 1);
    private bool? _canExecute;
    private string? _lastVerifiedPath;

    public BlendFileGenerator(
        IBlenderInstallationService blenderService,
        IServiceScopeFactory scopeFactory,
        IUploadPathProvider pathProvider,
        ILogger<BlendFileGenerator> logger)
    {
        _blenderService = blenderService;
        _scopeFactory = scopeFactory;
        _pathProvider = pathProvider;
        _logger = logger;
        _scriptPath = ResolveScriptPath();
    }

    public bool IsAvailable
    {
        get
        {
            var status = _blenderService.GetStatus();
            if (status.State != "installed" || string.IsNullOrEmpty(status.InstalledPath))
                return false;

            // Re-verify when the Blender path changes (e.g., reinstall or version switch)
            if (_lastVerifiedPath != status.InstalledPath)
            {
                _canExecute = null;
                _lastVerifiedPath = status.InstalledPath;
            }

            _canExecute ??= VerifyBlenderCanExecute(status.InstalledPath);
            return _canExecute.Value;
        }
    }

    private bool VerifyBlenderCanExecute(string blenderPath)
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = blenderPath,
                Arguments = "--version",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            });

            if (process == null)
                return false;

            if (!process.WaitForExit(TimeSpan.FromSeconds(10)))
            {
                process.Kill();
                _logger.LogWarning("Blender --version timed out — generated .blend files will not be available");
                return false;
            }

            if (process.ExitCode == 0)
            {
                _logger.LogInformation("Blender CLI verified — generated .blend files are available");
                return true;
            }

            _logger.LogWarning("Blender --version exited with code {ExitCode} — generated .blend files will not be available", process.ExitCode);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Blender binary at {Path} cannot execute — generated .blend files will not be available", blenderPath);
            return false;
        }
    }

    public long? GetCachedSizeBytes(int modelId, int versionId)
    {
        var cachePath = GetCachePath(modelId, versionId);
        try
        {
            var fi = new FileInfo(cachePath);
            return fi.Exists ? fi.Length : null;
        }
        catch
        {
            return null;
        }
    }

    public void InvalidateCache(int modelId, int versionId)
    {
        var cachePath = GetCachePath(modelId, versionId);
        try
        {
            if (File.Exists(cachePath))
            {
                File.Delete(cachePath);
                _logger.LogInformation("Invalidated cached .blend for model {ModelId}-v{VersionId}", modelId, versionId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to invalidate cached .blend for model {ModelId}-v{VersionId}", modelId, versionId);
        }
    }

    private string GetCachePath(int modelId, int versionId)
    {
        var cacheDir = Path.Combine(_pathProvider.UploadRootPath, "generated-blend");
        return Path.Combine(cacheDir, $"{modelId}-v{versionId}.blend");
    }

    public async Task<GeneratedBlendInfo?> GetOrGenerateAsync(int modelId, int versionId, CancellationToken cancellationToken = default)
    {
        if (!IsAvailable)
            return null;

        var cachePath = GetCachePath(modelId, versionId);
        var cacheDir = Path.GetDirectoryName(cachePath)!;

        // Return cached file if it exists
        if (File.Exists(cachePath))
        {
            var fileInfo = new FileInfo(cachePath);
            return new GeneratedBlendInfo(cachePath, fileInfo.Length, fileInfo.LastWriteTimeUtc);
        }

        // Serialize generation to avoid parallel Blender processes for same file
        await _generationLock.WaitAsync(cancellationToken);
        try
        {
            // Double-check after acquiring lock
            if (File.Exists(cachePath))
            {
                var fileInfo = new FileInfo(cachePath);
                return new GeneratedBlendInfo(cachePath, fileInfo.Length, fileInfo.LastWriteTimeUtc);
            }

            return await GenerateAsync(modelId, versionId, cachePath, cancellationToken);
        }
        finally
        {
            _generationLock.Release();
        }
    }

    private async Task<GeneratedBlendInfo?> GenerateAsync(int modelId, int versionId, string outputPath, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // Load model version with files and texture mappings
        var version = await dbContext.ModelVersions
            .AsNoTracking()
            .Where(v => v.Id == versionId && v.ModelId == modelId && !v.IsDeleted)
            .Include(v => v.Files)
            .Include(v => v.TextureMappings)
                .ThenInclude(tm => tm.TextureSet)
                    .ThenInclude(ts => ts.Textures)
                        .ThenInclude(t => t.File)
            .AsSplitQuery()
            .FirstOrDefaultAsync(cancellationToken);

        if (version == null)
        {
            _logger.LogWarning("Model version {ModelId}-v{VersionId} not found for .blend generation", modelId, versionId);
            return null;
        }

        // Find the renderable file
        var renderableFile = version.Files
            .FirstOrDefault(f => f.FileType.IsRenderable);

        if (renderableFile == null)
        {
            _logger.LogDebug("No renderable file found in model version {ModelId}-v{VersionId}", modelId, versionId);
            return null;
        }

        var renderablePath = GetPhysicalPath(renderableFile.Sha256Hash);
        if (!File.Exists(renderablePath))
        {
            _logger.LogWarning("Renderable file not found on disk: {Path}", renderablePath);
            return null;
        }

        // Build texture mapping JSON
        var textureJsonPath = await BuildTextureJsonAsync(version, cancellationToken);

        try
        {
            var blenderPath = _blenderService.GetStatus().InstalledPath!;

            var formatExt = $".{renderableFile.FileType.Value}";
            var args = $"-b -P \"{_scriptPath}\" -- --input \"{renderablePath}\" --output \"{outputPath}\" --format \"{formatExt}\"";
            if (textureJsonPath != null)
                args += $" --textures \"{textureJsonPath}\"";

            _logger.LogInformation("Generating .blend for model {ModelId}-v{VersionId} with Blender CLI", modelId, versionId);

            var processInfo = new ProcessStartInfo
            {
                FileName = blenderPath,
                Arguments = args,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(processInfo);
            if (process == null)
            {
                _logger.LogError("Failed to start Blender process");
                return null;
            }

            var stdout = await process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderr = await process.StandardError.ReadToEndAsync(cancellationToken);

            await process.WaitForExitAsync(cancellationToken);

            if (stdout.Length > 0)
                _logger.LogInformation("Blender stdout: {Stdout}", stdout);
            if (stderr.Length > 0)
                _logger.LogInformation("Blender stderr: {Stderr}", stderr);

            if (process.ExitCode != 0)
            {
                _logger.LogError("Blender exited with code {ExitCode}. stdout: {Stdout}, stderr: {Stderr}",
                    process.ExitCode, stdout, stderr);
                return null;
            }

            if (!File.Exists(outputPath))
            {
                _logger.LogError("Blender completed but output file not found at {Path}", outputPath);
                return null;
            }

            var outputInfo = new FileInfo(outputPath);
            _logger.LogInformation("Generated .blend file: {Path} ({Size:N0} bytes)", outputPath, outputInfo.Length);
            return new GeneratedBlendInfo(outputPath, outputInfo.Length, outputInfo.LastWriteTimeUtc);
        }
        finally
        {
            // Clean up temp texture JSON
            if (textureJsonPath != null)
            {
                try { File.Delete(textureJsonPath); } catch { /* best-effort cleanup */ }
            }
        }
    }

    private async Task<string?> BuildTextureJsonAsync(Domain.Models.ModelVersion version, CancellationToken cancellationToken)
    {
        var mappings = version.TextureMappings;
        _logger.LogDebug("Texture mappings count: {Count}, DefaultTextureSetId: {DefaultId}",
            mappings?.Count ?? 0, version.DefaultTextureSetId);
        if (mappings == null || !mappings.Any())
        {
            // Try DefaultTextureSetId as fallback
            if (version.DefaultTextureSetId == null)
                return null;

            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var defaultSet = await dbContext.TextureSets
                .AsNoTracking()
                .Include(ts => ts.Textures)
                    .ThenInclude(t => t.File)
                .FirstOrDefaultAsync(ts => ts.Id == version.DefaultTextureSetId, cancellationToken);

            if (defaultSet?.Textures == null || !defaultSet.Textures.Any())
                return null;

            var defaultTextures = BuildTextureDict(defaultSet.Textures);
            return await WriteTextureJsonAsync(new { materials = new Dictionary<string, object>(), @default = defaultTextures });
        }

        // Determine main variant
        var mainVariant = version.MainVariantName ?? "";
        var relevantMappings = mappings
            .Where(m => m.VariantName == mainVariant)
            .ToList();

        if (!relevantMappings.Any())
            relevantMappings = mappings.ToList();

        var materialsDict = new Dictionary<string, Dictionary<string, string>>();
        Dictionary<string, string>? defaultTextureDict = null;

        foreach (var mapping in relevantMappings)
        {
            var textureSet = mapping.TextureSet;
            if (textureSet?.Textures == null || !textureSet.Textures.Any())
                continue;

            var textures = BuildTextureDict(textureSet.Textures);

            if (string.IsNullOrEmpty(mapping.MaterialName))
            {
                // Empty material name = applies to all materials (default)
                defaultTextureDict = textures;
            }
            else
            {
                materialsDict[mapping.MaterialName] = textures;
            }
        }

        if (!materialsDict.Any() && defaultTextureDict == null)
            return null;

        return await WriteTextureJsonAsync(new { materials = materialsDict, @default = defaultTextureDict ?? new Dictionary<string, string>() });
    }

    private Dictionary<string, string> BuildTextureDict(ICollection<Domain.Models.Texture> textures)
    {
        var dict = new Dictionary<string, string>();

        foreach (var texture in textures)
        {
            var physicalPath = GetPhysicalPath(texture.File.Sha256Hash);
            if (!File.Exists(physicalPath))
                continue;

            var key = texture.TextureType switch
            {
                TextureType.Albedo => "albedo",
                TextureType.Normal => "normal",
                TextureType.Roughness => "roughness",
                TextureType.Metallic => "metallic",
                TextureType.AO => "ao",
                TextureType.Emissive => "emissive",
                TextureType.Height => "height",
                TextureType.Displacement => "height", // Treat displacement same as height
                TextureType.Bump => "normal",          // Treat bump as normal approximation
                TextureType.Alpha => "alpha",
                _ => null
            };

            if (key != null && !dict.ContainsKey(key))
            {
                dict[key] = physicalPath;
            }
        }

        return dict;
    }

    private async Task<string> WriteTextureJsonAsync(object data)
    {
        var tempPath = Path.Combine(Path.GetTempPath(), $"modelibr-textures-{Guid.NewGuid():N}.json");
        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = false });
        await File.WriteAllTextAsync(tempPath, json);
        return tempPath;
    }

    private string GetPhysicalPath(string sha256Hash)
    {
        var hash = sha256Hash.ToLowerInvariant();
        var a = hash[..2];
        var b = hash[2..4];
        return Path.Combine(_pathProvider.UploadRootPath, a, b, hash);
    }

    private static string ResolveScriptPath()
    {
        // Script is located alongside the Infrastructure assembly
        var assemblyDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
        var scriptPath = Path.Combine(assemblyDir, "Scripts", "generate_blend_with_textures.py");

        if (!File.Exists(scriptPath))
        {
            // Fallback: look relative to the source directory (development)
            var srcDir = Path.GetFullPath(Path.Combine(assemblyDir, "..", "..", "..", ".."));
            scriptPath = Path.Combine(srcDir, "src", "Infrastructure", "Scripts", "generate_blend_with_textures.py");
        }

        return scriptPath;
    }
}
