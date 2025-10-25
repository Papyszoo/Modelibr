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
            .FirstOrDefaultAsync(f => f.Id == id && !f.Deleted, cancellationToken);
    }

    public async Task<Domain.Models.File?> GetByIdIncludingDeletedAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);
    }

    public async Task<Domain.Models.File?> GetBySha256HashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .FirstOrDefaultAsync(f => f.Sha256Hash == sha256Hash && !f.Deleted, cancellationToken);
    }

    public async Task<IEnumerable<Domain.Models.File>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .Where(f => !f.Deleted)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Domain.Models.File>> GetFilesByModelIdAsync(int modelId, CancellationToken cancellationToken = default)
    {
        return await _context.Files
            .Include(f => f.Models)
            .Where(f => f.Models.Any(m => m.Id == modelId) && !f.Deleted)
            .ToListAsync(cancellationToken);
    }

    public async Task UpdateAsync(Domain.Models.File file, CancellationToken cancellationToken = default)
    {
        _context.Files.Update(file);
        await _context.SaveChangesAsync(cancellationToken);
    }
}