using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Settings;
using Domain.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Infrastructure.Services;

public sealed class BlenderInstallationService : IBlenderInstallationService
{
    // Known Blender LTS series (major.minor strings)
    private static readonly HashSet<string> LtsSeries = ["3.3", "3.6", "4.2"];

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<BlenderInstallationService> _logger;
    private readonly SemaphoreSlim _installLock = new(1, 1);
    private readonly SemaphoreSlim _versionFetchLock = new(1, 1);
    private readonly string _installBasePath;

    // Version list cache
    private IReadOnlyList<BlenderVersionInfo>? _cachedVersions;
    private DateTime _cacheExpiry = DateTime.MinValue;

    // In-memory state
    private string _state = "none"; // none, downloading, extracting, installed, failed
    private string? _installedVersion;
    private string? _installedPath;
    private int _progress;
    private long? _downloadedBytes;
    private long? _totalBytes;
    private string? _error;
    private CancellationTokenSource? _activeCts;

    public BlenderInstallationService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<BlenderInstallationService> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;

        _installBasePath = Environment.GetEnvironmentVariable("BLENDER_INSTALL_PATH")
            ?? (RuntimeInformation.IsOSPlatform(OSPlatform.Linux)
                ? "/var/lib/modelibr/blender"
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".modelibr", "blender"));

        _ = InitializeFromSettingsAsync();
    }

    public async Task<BlenderVersionsResult> GetAvailableVersionsAsync(CancellationToken cancellationToken)
    {
        // Return from cache if still valid
        if (_cachedVersions != null && DateTime.UtcNow < _cacheExpiry)
            return new BlenderVersionsResult(_cachedVersions, false);

        // Block concurrent callers: wait for the lock; the first acquires and fetches,
        // subsequent ones wait then see the populated cache in the double-check below.
        await _versionFetchLock.WaitAsync(cancellationToken);

        try
        {
            // Double-check after acquiring lock
            if (_cachedVersions != null && DateTime.UtcNow < _cacheExpiry)
                return new BlenderVersionsResult(_cachedVersions, false);

            return await FetchVersionsInternalAsync(cancellationToken);
        }
        finally
        {
            _versionFetchLock.Release();
        }
    }

    private async Task<BlenderVersionsResult> FetchVersionsInternalAsync(CancellationToken ct)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(15));

        try
        {
            var httpClient = _httpClientFactory.CreateClient("BlenderDownload");

            // Fetch the official release index (Apache directory listing)
            var indexHtml = await httpClient.GetStringAsync(
                "https://download.blender.org/release/", timeoutCts.Token);

            // Extract BlenderX.Y directory names
            var majorMinors = Regex.Matches(indexHtml, @"href=""Blender(\d+\.\d+)/""")
                .Select(m => m.Groups[1].Value)
                .Where(v =>
                {
                    var parts = v.Split('.');
                    return parts.Length == 2
                        && int.TryParse(parts[0], out var major) && major >= 3
                        && int.TryParse(parts[1], out _);
                })
                .Distinct()
                .OrderByDescending(v =>
                {
                    var p = v.Split('.');
                    return int.Parse(p[0]) * 1000 + int.Parse(p[1]);
                })
                .Take(10)
                .ToList();

            if (majorMinors.Count == 0)
            {
                _logger.LogWarning("No Blender version directories found in release index");
                return new BlenderVersionsResult(_cachedVersions ?? [], true);
            }

            // Fetch each subdirectory in parallel to determine latest patch version
            var tasks = majorMinors.Select(mm => FetchLatestPatchAsync(httpClient, mm, timeoutCts.Token));
            var results = await Task.WhenAll(tasks);

            var versions = results
                .Where(v => v != null)
                .Cast<BlenderVersionInfo>()
                .OrderByDescending(v =>
                {
                    var p = v.Version.Split('.');
                    return p.Length >= 3
                        ? int.Parse(p[0]) * 1_000_000 + int.Parse(p[1]) * 1000 + int.Parse(p[2])
                        : 0;
                })
                .ToList();

            _cachedVersions = versions;
            _cacheExpiry = DateTime.UtcNow.AddHours(1);

            _logger.LogInformation("Fetched {Count} Blender versions from download.blender.org", versions.Count);
            return new BlenderVersionsResult(versions, false);
        }
        catch (Exception ex) when (ex is OperationCanceledException or HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning("Could not fetch Blender versions (offline?): {Message}", ex.Message);
            return new BlenderVersionsResult(_cachedVersions ?? [], true);
        }
    }

    private static async Task<BlenderVersionInfo?> FetchLatestPatchAsync(
        HttpClient httpClient, string majorMinor, CancellationToken ct)
    {
        try
        {
            var html = await httpClient.GetStringAsync(
                $"https://download.blender.org/release/Blender{majorMinor}/", ct);

            // Match filenames like blender-5.1.0-linux-x64.tar.xz to extract patch version
            var matches = Regex.Matches(html,
                $@"blender-({Regex.Escape(majorMinor)}\.(\d+))-");

            if (matches.Count == 0) return null;

            var latestPatch = matches.Cast<Match>()
                .OrderByDescending(m => int.Parse(m.Groups[2].Value))
                .First().Groups[1].Value;

            var mm = string.Join(".", latestPatch.Split('.').Take(2));
            var isLts = LtsSeries.Contains(mm);
            return new BlenderVersionInfo(
                latestPatch,
                $"Blender {latestPatch}{(isLts ? " LTS" : "")}",
                isLts);
        }
        catch
        {
            return null;
        }
    }

    public BlenderInstallStatus GetStatus() => new(
        _state,
        _installedVersion,
        _installedPath,
        _progress,
        _downloadedBytes,
        _totalBytes,
        _error);

    public async Task InstallAsync(string version, CancellationToken cancellationToken)
    {
        if (!Regex.IsMatch(version, @"^\d+\.\d+\.\d+$"))
            throw new ArgumentException($"Invalid version format: {version}. Expected X.Y.Z");

        if (!await _installLock.WaitAsync(0, cancellationToken))
            throw new InvalidOperationException("Another installation is already in progress.");

        // Cancel any previous operation
        _activeCts?.Cancel();
        _activeCts?.Dispose();
        _activeCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var ct = _activeCts.Token;

        try
        {
            _state = "downloading";
            _progress = 0;
            _downloadedBytes = 0;
            _totalBytes = null;
            _error = null;

            // Remove previous version directory if switching (without resetting state)
            if (_installedVersion != null && _installedVersion != version)
            {
                var oldExtractDir = Path.Combine(_installBasePath, $"blender-{_installedVersion}");
                if (Directory.Exists(oldExtractDir))
                    await Task.Run(() => Directory.Delete(oldExtractDir, true));
                _installedVersion = null;
                _installedPath = null;
            }

            var downloadUrl = GetDownloadUrl(version);
            var archiveFileName = GetArchiveFileName(version);
            var archiveDir = Path.Combine(_installBasePath, "downloads");
            Directory.CreateDirectory(archiveDir);
            var archivePath = Path.Combine(archiveDir, archiveFileName);

            _logger.LogInformation("Downloading Blender {Version} from {Url}", version, downloadUrl);

            // Download with progress
            var httpClient = _httpClientFactory.CreateClient("BlenderDownload");
            using var response = await httpClient.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            _totalBytes = response.Content.Headers.ContentLength;

            await using (var contentStream = await response.Content.ReadAsStreamAsync(ct))
            await using (var fileStream = new FileStream(archivePath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
            {
                var buffer = new byte[81920];
                long totalRead = 0;
                int bytesRead;

                while ((bytesRead = await contentStream.ReadAsync(buffer, ct)) > 0)
                {
                    await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead), ct);
                    totalRead += bytesRead;
                    _downloadedBytes = totalRead;
                    _progress = _totalBytes > 0 ? (int)(totalRead * 100 / _totalBytes.Value) : 0;
                }
            }

            // Extract
            _state = "extracting";
            _progress = 0;
            _logger.LogInformation("Extracting Blender {Version}", version);

            var extractDir = Path.Combine(_installBasePath, $"blender-{version}");
            if (Directory.Exists(extractDir))
                Directory.Delete(extractDir, true);
            Directory.CreateDirectory(extractDir);

            await ExtractArchiveAsync(archivePath, extractDir, ct);

            // Find the blender binary
            var blenderBinary = FindBlenderBinary(extractDir);
            if (blenderBinary == null)
            {
                _state = "failed";
                _error = "Could not find Blender binary after extraction.";
                return;
            }

            // Make binary executable on Unix
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                await RunProcessAsync("chmod", $"+x \"{blenderBinary}\"", ct);
            }

            // Verify it works
            // Note: execution is skipped — the WebApi container may not have x86_64 QEMU support
            // (e.g. ARM64 host running dotnet/aspnet image). The asset-processor container has
            // binfmt_misc/QEMU configured and will be the one actually executing the binary.
            // We just confirm the file exists and is non-empty as a sanity check.
            var binaryInfo = new FileInfo(blenderBinary);
            if (!binaryInfo.Exists || binaryInfo.Length < 1024)
            {
                _state = "failed";
                _error = "Blender binary found but appears invalid (too small or missing).";
                return;
            }
            _logger.LogInformation("Blender binary found at {Path} ({Size:N0} bytes)", blenderBinary, binaryInfo.Length);

            // Clean up archive
            try { System.IO.File.Delete(archivePath); } catch { /* ignore */ }

            // Persist to settings
            _installedVersion = version;
            _installedPath = blenderBinary;
            _state = "installed";
            _progress = 100;
            _error = null;

            await PersistSettingsAsync(version, blenderBinary);

            _logger.LogInformation("Blender {Version} installed at {Path}", version, blenderBinary);
        }
        catch (OperationCanceledException)
        {
            _state = _installedVersion != null ? "installed" : "none";
            _error = "Installation was cancelled.";
            throw;
        }
        catch (Exception ex)
        {
            _state = "failed";
            _error = ex.Message;
            _logger.LogError(ex, "Failed to install Blender {Version}", version);
            throw;
        }
        finally
        {
            _installLock.Release();
        }
    }

    public async Task UninstallAsync(CancellationToken cancellationToken)
    {
        if (!await _installLock.WaitAsync(0, cancellationToken))
            throw new InvalidOperationException("Cannot uninstall while an operation is in progress.");

        try
        {
            await UninstallInternalAsync();
            await PersistSettingsAsync(null, "blender");

            _logger.LogInformation("Blender uninstalled");
        }
        finally
        {
            _installLock.Release();
        }
    }

    private async Task UninstallInternalAsync()
    {
        if (_installedVersion != null)
        {
            var extractDir = Path.Combine(_installBasePath, $"blender-{_installedVersion}");
            if (Directory.Exists(extractDir))
            {
                await Task.Run(() => Directory.Delete(extractDir, true));
            }
        }

        _installedVersion = null;
        _installedPath = null;
        _state = "none";
        _progress = 0;
        _downloadedBytes = null;
        _totalBytes = null;
        _error = null;
    }

    private async Task InitializeFromSettingsAsync()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<ISettingRepository>();

            var versionSetting = await repo.GetByKeyAsync(SettingKeys.BlenderInstallVersion);
            var pathSetting = await repo.GetByKeyAsync(SettingKeys.BlenderPath);

            if (versionSetting?.Value is { Length: > 0 }
                && pathSetting?.Value is { Length: > 0 }
                && pathSetting.Value != "blender"
                && System.IO.File.Exists(pathSetting.Value))
            {
                _installedVersion = versionSetting.Value;
                _installedPath = pathSetting.Value;
                _state = "installed";
                _progress = 100;
                _logger.LogInformation("Detected existing Blender installation: {Version} at {Path}", versionSetting.Value, pathSetting.Value);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read Blender installation state from settings");
        }
    }

    private async Task PersistSettingsAsync(string? version, string path)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<ISettingRepository>();
            var now = DateTime.UtcNow;

            await UpdateOrCreateSettingAsync(repo, SettingKeys.BlenderInstallVersion, version ?? "", now);
            await UpdateOrCreateSettingAsync(repo, SettingKeys.BlenderPath, path, now);

            if (version == null)
            {
                await UpdateOrCreateSettingAsync(repo, SettingKeys.BlenderEnabled, "false", now);
            }
            else
            {
                await UpdateOrCreateSettingAsync(repo, SettingKeys.BlenderEnabled, "true", now);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist Blender settings");
        }
    }

    private static async Task UpdateOrCreateSettingAsync(ISettingRepository repo, string key, string value, DateTime now, CancellationToken cancellationToken = default)
    {
        var setting = await repo.GetByKeyAsync(key, cancellationToken);
        if (setting == null)
        {
            setting = Setting.Create(key, value, now);
            await repo.AddAsync(setting, cancellationToken);
        }
        else
        {
            setting.UpdateValue(value, now);
            await repo.UpdateAsync(setting, cancellationToken);
        }
    }

    private static string GetDownloadUrl(string version)
    {
        var parts = version.Split('.');
        var majorMinor = $"{parts[0]}.{parts[1]}";

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            return $"https://download.blender.org/release/Blender{majorMinor}/blender-{version}-linux-x64.tar.xz";

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            var arch = RuntimeInformation.OSArchitecture == Architecture.Arm64 ? "arm64" : "x64";
            return $"https://download.blender.org/release/Blender{majorMinor}/blender-{version}-macos-{arch}.dmg";
        }

        return $"https://download.blender.org/release/Blender{majorMinor}/blender-{version}-windows-x64.zip";
    }

    private static string GetArchiveFileName(string version)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            return $"blender-{version}-linux-x64.tar.xz";

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            var arch = RuntimeInformation.OSArchitecture == Architecture.Arm64 ? "arm64" : "x64";
            return $"blender-{version}-macos-{arch}.dmg";
        }

        return $"blender-{version}-windows-x64.zip";
    }

    private async Task ExtractArchiveAsync(string archivePath, string extractDir, CancellationToken ct)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            await RunProcessAsync("tar", $"-xf \"{archivePath}\" -C \"{extractDir}\" --strip-components=1", ct);
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            await ExtractDmgAsync(archivePath, extractDir, ct);
        }
        else
        {
            // Windows: extract ZIP
            System.IO.Compression.ZipFile.ExtractToDirectory(archivePath, extractDir);
        }
    }

    private async Task ExtractDmgAsync(string dmgPath, string extractDir, CancellationToken ct)
    {
        var mountPoint = Path.Combine(Path.GetTempPath(), $"blender-mount-{Guid.NewGuid():N}");
        Directory.CreateDirectory(mountPoint);

        try
        {
            await RunProcessAsync("hdiutil", $"attach \"{dmgPath}\" -nobrowse -mountpoint \"{mountPoint}\"", ct);

            // Find Blender.app in the mounted volume
            var appPath = Directory.GetDirectories(mountPoint, "Blender*.app").FirstOrDefault()
                ?? Directory.GetDirectories(mountPoint, "*.app").FirstOrDefault();

            if (appPath == null)
                throw new InvalidOperationException("Could not find Blender.app in the DMG.");

            // Copy the .app bundle
            await RunProcessAsync("cp", $"-R \"{appPath}\" \"{extractDir}/\"", ct);
        }
        finally
        {
            try { await RunProcessAsync("hdiutil", $"detach \"{mountPoint}\" -quiet", CancellationToken.None); } catch { /* ignore */ }
            try { Directory.Delete(mountPoint, true); } catch { /* ignore */ }
        }
    }

    private static string? FindBlenderBinary(string extractDir)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            // macOS: Blender.app/Contents/MacOS/Blender
            var candidates = new[]
            {
                Path.Combine(extractDir, "Blender.app", "Contents", "MacOS", "Blender"),
                Path.Combine(extractDir, "Blender.app", "Contents", "MacOS", "blender"),
            };
            foreach (var c in candidates)
                if (System.IO.File.Exists(c)) return c;

            // Search recursively
            return Directory.GetFiles(extractDir, "blender", SearchOption.AllDirectories)
                .Concat(Directory.GetFiles(extractDir, "Blender", SearchOption.AllDirectories))
                .FirstOrDefault(f => !f.EndsWith(".py") && !f.EndsWith(".sh"));
        }

        // Linux/Windows
        var names = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? new[] { "blender.exe" }
            : new[] { "blender" };

        foreach (var name in names)
        {
            var direct = Path.Combine(extractDir, name);
            if (System.IO.File.Exists(direct)) return direct;

            // May be nested in a subdirectory
            var found = Directory.GetFiles(extractDir, name, SearchOption.AllDirectories)
                .FirstOrDefault(f => !f.EndsWith(".py") && !f.EndsWith(".sh") && !f.Contains("thumbnailer"));
            if (found != null) return found;
        }

        return null;
    }

    private static async Task<string> RunProcessAsync(string fileName, string arguments, CancellationToken ct)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            }
        };

        process.Start();
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);

        if (process.ExitCode != 0)
            throw new InvalidOperationException($"{fileName} exited with code {process.ExitCode}: {stderr}");

        return stdout;
    }
}
