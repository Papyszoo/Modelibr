using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class FileRepository : IFileRepository
{
    private readonly ApplicationDbContext _context;

    public FileRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Domain.Models.File?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
    }

    public async Task<Domain.Models.File?> GetBySha256HashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .FirstOrDefaultAsync(f => f.Sha256Hash == sha256Hash, cancellationToken);
    }

    public async Task<IEnumerable<Domain.Models.File>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Domain.Models.File>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .IgnoreQueryFilters()
            .Where(f => f.IsDeleted)
            .Include(f => f.Models)
            .ToListAsync(cancellationToken);
    }

    public async Task<Domain.Models.File?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .IgnoreQueryFilters()
            .Where(f => f.IsDeleted)
            .Include(f => f.Models)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
    }

    public async Task UpdateAsync(Domain.Models.File file, CancellationToken cancellationToken = default)
    {
        _context.Files.Update(file);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IEnumerable<Domain.Models.File>> GetFilesByModelIdAsync(int modelId, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .Where(f => f.Models.Any(m => m.Id == modelId))
            .ToListAsync(cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Must use IgnoreQueryFilters() because the file may be soft-deleted (called from PermanentDeleteEntityCommandHandler)
        var file = await _context.Files.IgnoreQueryFilters().FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
        if (file != null)
        {
            _context.Files.Remove(file);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<bool> IsFileSharedAsync(int fileId, int excludeVersionId, CancellationToken cancellationToken = default)
    {
        // Get the file to check
        var file = await _context.Files
            .Where(f => f.Id == fileId)
            .Select(f => new { f.Sha256Hash })
            .FirstOrDefaultAsync(cancellationToken);
        
        if (file == null || string.IsNullOrEmpty(file.Sha256Hash))
            return false;
        
        // Check if any other non-deleted file with the same hash exists for a different version
        return await _context.Files
            .Where(f => f.Sha256Hash == file.Sha256Hash)
            .Where(f => f.Id != fileId)
            .Where(f => f.ModelVersionId != excludeVersionId || f.ModelVersionId == null)
            .AnyAsync(cancellationToken);
    }
}