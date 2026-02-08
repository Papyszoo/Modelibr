using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class BatchUploadRepository : IBatchUploadRepository
{
    private readonly ApplicationDbContext _context;

    public BatchUploadRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<BatchUpload?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.BatchUploads
            .Include(bu => bu.File)
            .Include(bu => bu.Pack)
            .Include(bu => bu.Project)
            .Include(bu => bu.Model)
            .Include(bu => bu.TextureSet)
            .FirstOrDefaultAsync(bu => bu.Id == id, cancellationToken);
    }

    public async Task<IEnumerable<BatchUpload>> GetByBatchIdAsync(string batchId, CancellationToken cancellationToken = default)
    {
        return await _context.BatchUploads
            .AsNoTracking()
            .Include(bu => bu.File)
            .Include(bu => bu.Pack)
            .Include(bu => bu.Project)
            .Include(bu => bu.Model)
            .Include(bu => bu.TextureSet)
            .Where(bu => bu.BatchId == batchId)
            .OrderBy(bu => bu.UploadedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<BatchUpload>> GetByUploadTypeAsync(string uploadType, CancellationToken cancellationToken = default)
    {
        return await _context.BatchUploads
            .AsNoTracking()
            .Include(bu => bu.File)
            .Include(bu => bu.Pack)
            .Include(bu => bu.Project)
            .Include(bu => bu.Model)
            .Include(bu => bu.TextureSet)
            .Where(bu => bu.UploadType == uploadType)
            .OrderByDescending(bu => bu.UploadedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<BatchUpload>> GetByDateRangeAsync(DateTime from, DateTime to, CancellationToken cancellationToken = default)
    {
        return await _context.BatchUploads
            .AsNoTracking()
            .Include(bu => bu.File)
            .Include(bu => bu.Pack)
            .Include(bu => bu.Project)
            .Include(bu => bu.Model)
            .Include(bu => bu.TextureSet)
            .Where(bu => bu.UploadedAt >= from && bu.UploadedAt <= to)
            .OrderByDescending(bu => bu.UploadedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(BatchUpload batchUpload, CancellationToken cancellationToken = default)
    {
        await _context.BatchUploads.AddAsync(batchUpload, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task AddRangeAsync(IEnumerable<BatchUpload> batchUploads, CancellationToken cancellationToken = default)
    {
        await _context.BatchUploads.AddRangeAsync(batchUploads, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<BatchUpload?> GetByFileIdAsync(int fileId, CancellationToken cancellationToken = default)
    {
        return await _context.BatchUploads
            .Include(bu => bu.File)
            .Include(bu => bu.Pack)
            .Include(bu => bu.Project)
            .Include(bu => bu.Model)
            .Include(bu => bu.TextureSet)
            .FirstOrDefaultAsync(bu => bu.FileId == fileId, cancellationToken);
    }

    public async Task<IEnumerable<BatchUpload>> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default)
    {
        return await _context.BatchUploads
            .AsNoTracking()
            .Include(bu => bu.File)
            .Include(bu => bu.Pack)
            .Include(bu => bu.Project)
            .Include(bu => bu.Model)
            .Include(bu => bu.TextureSet)
            .Where(bu => bu.ModelId == modelId)
            .ToListAsync(cancellationToken);
    }

    public async Task UpdateAsync(BatchUpload batchUpload, CancellationToken cancellationToken = default)
    {
        // Use FindAsync + SetValues to avoid entity graph traversal.
        // Update() recursively attaches navigation properties, causing tracking
        // conflicts when related entities (e.g., Model) are already tracked.
        var tracked = await _context.BatchUploads.FindAsync(new object[] { batchUpload.Id }, cancellationToken);
        if (tracked != null)
        {
            _context.Entry(tracked).CurrentValues.SetValues(batchUpload);
        }
        else
        {
            _context.BatchUploads.Add(batchUpload);
        }
        await _context.SaveChangesAsync(cancellationToken);
    }
}
