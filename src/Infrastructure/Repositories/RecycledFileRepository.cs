using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class RecycledFileRepository : IRecycledFileRepository
{
    private readonly ApplicationDbContext _context;

    public RecycledFileRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<RecycledFile?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.RecycledFiles
            .FirstOrDefaultAsync(rf => rf.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<RecycledFile>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.RecycledFiles
            .OrderByDescending(rf => rf.RecycledAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<RecycledFile>> GetExpiredAsync(DateTime beforeDate, CancellationToken cancellationToken = default)
    {
        return await _context.RecycledFiles
            .Where(rf => rf.ScheduledDeletionAt != null && rf.ScheduledDeletionAt <= beforeDate)
            .ToListAsync(cancellationToken);
    }

    public async Task<RecycledFile> AddAsync(RecycledFile recycledFile, CancellationToken cancellationToken = default)
    {
        _context.RecycledFiles.Add(recycledFile);
        await _context.SaveChangesAsync(cancellationToken);
        return recycledFile;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var recycledFile = await GetByIdAsync(id, cancellationToken);
        if (recycledFile != null)
        {
            _context.RecycledFiles.Remove(recycledFile);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<int> DeleteExpiredAsync(DateTime beforeDate, CancellationToken cancellationToken = default)
    {
        var expiredFiles = await GetExpiredAsync(beforeDate, cancellationToken);
        if (expiredFiles.Count > 0)
        {
            _context.RecycledFiles.RemoveRange(expiredFiles);
            await _context.SaveChangesAsync(cancellationToken);
        }
        return expiredFiles.Count;
    }
}
