using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;

namespace Application.Abstractions.Services;

public interface IFileRecyclingService
{
    Task<RecycledFile> RecycleFileAsync(
        Domain.Models.File file, 
        string reason, 
        CancellationToken cancellationToken = default);
    
    Task<int> CleanupExpiredRecycledFilesAsync(CancellationToken cancellationToken = default);
}

internal class FileRecyclingService : IFileRecyclingService
{
    private readonly IRecycledFileRepository _recycledFileRepository;
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public FileRecyclingService(
        IRecycledFileRepository recycledFileRepository,
        IApplicationSettingsRepository settingsRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _recycledFileRepository = recycledFileRepository;
        _settingsRepository = settingsRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<RecycledFile> RecycleFileAsync(
        Domain.Models.File file, 
        string reason, 
        CancellationToken cancellationToken = default)
    {
        var settings = await _settingsRepository.GetAsync(cancellationToken);
        var now = _dateTimeProvider.UtcNow;
        
        var cleanAfterDays = settings?.CleanRecycledFilesAfterDays ?? 30;
        var scheduledDeletionAt = now.AddDays(cleanAfterDays);

        var recycledFile = RecycledFile.Create(
            file.OriginalFileName,
            file.StoredFileName,
            file.FilePath,
            file.Sha256Hash,
            file.SizeBytes,
            reason,
            now,
            scheduledDeletionAt
        );

        return await _recycledFileRepository.AddAsync(recycledFile, cancellationToken);
    }

    public async Task<int> CleanupExpiredRecycledFilesAsync(CancellationToken cancellationToken = default)
    {
        var now = _dateTimeProvider.UtcNow;
        return await _recycledFileRepository.DeleteExpiredAsync(now, cancellationToken);
    }
}
