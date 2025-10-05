using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

/// <summary>
/// Repository implementation for ThumbnailJobEvent entity operations.
/// </summary>
public class ThumbnailJobEventRepository : IThumbnailJobEventRepository
{
    private readonly ApplicationDbContext _context;

    public ThumbnailJobEventRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<ThumbnailJobEvent> AddAsync(ThumbnailJobEvent jobEvent, CancellationToken cancellationToken = default)
    {
        _context.ThumbnailJobEvents.Add(jobEvent);
        await _context.SaveChangesAsync(cancellationToken);
        return jobEvent;
    }

    public async Task<IEnumerable<ThumbnailJobEvent>> GetByJobIdAsync(int thumbnailJobId, CancellationToken cancellationToken = default)
    {
        return await _context.ThumbnailJobEvents
            .Where(tje => tje.ThumbnailJobId == thumbnailJobId)
            .OrderBy(tje => tje.OccurredAt)
            .ToListAsync(cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
