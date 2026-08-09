using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

/// <summary>
/// Concurrency-safe persistence for <see cref="ExtractionJob"/>. Unlike
/// <see cref="ThumbnailJobRepository"/> it never opens its own transaction or
/// calls SaveChangesAsync: the claim is a single atomic UPDATE that also handles
/// expired-lock recovery, so the unit of work stays with the command handler.
/// </summary>
internal sealed class ExtractionJobRepository : IExtractionJobRepository
{
    private readonly ApplicationDbContext _context;

    public ExtractionJobRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task<ExtractionJob> AddAsync(ExtractionJob job, CancellationToken cancellationToken = default)
    {
        _context.ExtractionJobs.Add(job);
        return Task.FromResult(job);
    }

    public Task UpdateAsync(ExtractionJob job, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(job);
        return Task.CompletedTask;
    }

    public async Task<ExtractionJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ExtractionJobs
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
    }

    public async Task<ExtractionJob?> GetLiveJobAsync(
        string assetType,
        int assetId,
        int? versionId,
        string extractorFamily,
        CancellationToken cancellationToken = default)
    {
        return await _context.ExtractionJobs
            .FirstOrDefaultAsync(
                e => e.AssetType == assetType &&
                     e.AssetId == assetId &&
                     e.VersionId == versionId &&
                     e.ExtractorFamily == extractorFamily &&
                     (e.Status == ExtractionJobStatus.Pending || e.Status == ExtractionJobStatus.Processing),
                cancellationToken);
    }

    public async Task<ExtractionJob?> GetNextClaimableJobAsync(
        string extractorFamily,
        DateTime nowUtc,
        CancellationToken cancellationToken = default)
    {
        return await _context.ExtractionJobs
            .AsNoTracking()
            .Where(e => e.ExtractorFamily == extractorFamily &&
                        (e.Status == ExtractionJobStatus.Pending ||
                         (e.Status == ExtractionJobStatus.Processing &&
                          e.LockedAt.HasValue &&
                          e.LockedAt.Value.AddMinutes(e.LockTimeoutMinutes) <= nowUtc)))
            .OrderBy(e => e.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> TryClaimJobAsync(
        int jobId,
        string workerId,
        DateTime claimedAtUtc,
        CancellationToken cancellationToken = default)
    {
        // Single atomic statement claiming a job that is Pending OR whose lock has
        // expired. PostgreSQL row-locks the match, so racing workers see zero rows
        // once the first commits. Mirrors the domain TryClaim transition. Using
        // ExecuteUpdateAsync (not SaveChangesAsync) keeps this repository outside
        // the self-commit fitness gate.
        var rowsAffected = await _context.ExtractionJobs
            .Where(e => e.Id == jobId &&
                        (e.Status == ExtractionJobStatus.Pending ||
                         (e.Status == ExtractionJobStatus.Processing &&
                          e.LockedAt.HasValue &&
                          e.LockedAt.Value.AddMinutes(e.LockTimeoutMinutes) <= claimedAtUtc)))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(e => e.Status, ExtractionJobStatus.Processing)
                .SetProperty(e => e.LockedBy, workerId)
                .SetProperty(e => e.LockedAt, claimedAtUtc)
                .SetProperty(e => e.AttemptCount, e => e.AttemptCount + 1)
                .SetProperty(e => e.UpdatedAt, claimedAtUtc),
                cancellationToken);

        return rowsAffected == 1;
    }
}
