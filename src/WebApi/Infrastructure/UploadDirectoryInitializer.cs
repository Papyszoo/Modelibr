using Application.Abstractions.Storage;

namespace WebApi.Infrastructure;

public sealed class UploadDirectoryInitializer : IHostedService
{
    private readonly IUploadPathProvider _provider;
    private readonly ILogger<UploadDirectoryInitializer> _logger;

    public UploadDirectoryInitializer(IUploadPathProvider provider, ILogger<UploadDirectoryInitializer> logger)
    {
        _provider = provider;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_provider.UploadRootPath);
        Directory.CreateDirectory(Path.Combine(_provider.UploadRootPath, "tmp"));
        _logger.LogInformation("Upload directories ensured at: {Path}", _provider.UploadRootPath);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}