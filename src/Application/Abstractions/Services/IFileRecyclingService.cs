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
