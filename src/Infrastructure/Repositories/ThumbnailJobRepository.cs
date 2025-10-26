using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

/// <summary>
/// Repository implementation for ThumbnailJob entity with concurrency-safe operations.
/// </summary>
public class ThumbnailJobRepository : IThumbnailJobRepository
{
    private readonly ApplicationDbContext _context;

    public ThumbnailJobRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<ThumbnailJob> AddAsync(ThumbnailJob job, CancellationToken cancellationToken = default)
    {
        _context.ThumbnailJobs.Add(job);
        await _context.SaveChangesAsync(cancellationToken);
        return job;
    }

    public async Task UpdateAsync(ThumbnailJob job, CancellationToken cancellationToken = default)
    {
        _context.ThumbnailJobs.Update(job);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<ThumbnailJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ThumbnailJobs
            .Include(tj => tj.Model)
            .FirstOrDefaultAsync(tj => tj.Id == id, cancellationToken);
    }

    public async Task<ThumbnailJob?> GetByModelVersionIdAsync(int modelVersionId, CancellationToken cancellationToken = default)
    {
        return await _context.ThumbnailJobs
            .Include(tj => tj.Model)
            .FirstOrDefaultAsync(tj => tj.ModelVersionId == modelVersionId, cancellationToken);
    }

    public async Task<IEnumerable<ThumbnailJob>> GetActiveJobsByModelIdAsync(int modelId, CancellationToken cancellationToken = default)
    {
        return await _context.ThumbnailJobs
            .Include(tj => tj.Model)
            .Where(tj => tj.ModelId == modelId && 
                        (tj.Status == ThumbnailJobStatus.Pending || tj.Status == ThumbnailJobStatus.Processing))
            .ToListAsync(cancellationToken);
    }

    public async Task<ThumbnailJob?> GetNextPendingJobAsync(CancellationToken cancellationToken = default)
    {
        // Use a database transaction to ensure atomicity when claiming jobs
        using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        
        try
        {
            // Get the oldest pending job or a job with expired lock
            var currentTime = DateTime.UtcNow;
            
            var job = await _context.ThumbnailJobs
                .Include(tj => tj.Model)
                .Where(tj => tj.Status == ThumbnailJobStatus.Pending || 
                           (tj.Status == ThumbnailJobStatus.Processing && 
                            tj.LockedAt.HasValue && 
                            tj.LockedAt.Value.AddMinutes(tj.LockTimeoutMinutes) <= currentTime))
                .OrderBy(tj => tj.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (job != null && job.Status == ThumbnailJobStatus.Processing)
            {
                // Reset expired lock
                job.Reset(currentTime);
                await _context.SaveChangesAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            return job;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<IEnumerable<ThumbnailJob>> GetJobsWithExpiredLocksAsync(CancellationToken cancellationToken = default)
    {
        var currentTime = DateTime.UtcNow;
        
        return await _context.ThumbnailJobs
            .Include(tj => tj.Model)
            .Where(tj => tj.Status == ThumbnailJobStatus.Processing &&
                        tj.LockedAt.HasValue &&
                        tj.LockedAt.Value.AddMinutes(tj.LockTimeoutMinutes) <= currentTime)
            .ToListAsync(cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}