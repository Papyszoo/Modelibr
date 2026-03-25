namespace Application.Abstractions.Services;

public record BlenderVersionInfo(string Version, string Label, bool IsLts);

public record BlenderInstallStatus(
    string State,
    string? InstalledVersion,
    string? InstalledPath,
    int Progress,
    long? DownloadedBytes,
    long? TotalBytes,
    string? Error);

public record BlenderVersionsResult(
    IReadOnlyList<BlenderVersionInfo> Versions,
    bool IsOffline);

public interface IBlenderInstallationService
{
    Task<BlenderVersionsResult> GetAvailableVersionsAsync(CancellationToken cancellationToken);
    BlenderInstallStatus GetStatus();
    Task InstallAsync(string version, CancellationToken cancellationToken);
    Task UninstallAsync(CancellationToken cancellationToken);
}
