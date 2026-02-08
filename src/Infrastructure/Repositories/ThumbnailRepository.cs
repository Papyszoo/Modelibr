using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

/// <summary>
/// Repository implementation for Thumbnail entity operations.
/// </summary>
internal sealed class ThumbnailRepository : IThumbnailRepository
{
    private readonly ApplicationDbContext _context;

    public ThumbnailRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<Thumbnail> AddAsync(Thumbnail thumbnail, CancellationToken cancellationToken = default)
    {
        _context.Thumbnails.Add(thumbnail);
        await _context.SaveChangesAsync(cancellationToken);
        return thumbnail;
    }

    public async Task UpdateAsync(Thumbnail thumbnail, CancellationToken cancellationToken = default)
    {
        _context.Thumbnails.Update(thumbnail);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<Thumbnail?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Thumbnails
            .Include(t => t.ModelVersion)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
    }

    public async Task<Thumbnail?> GetByModelVersionIdAsync(int modelVersionId, CancellationToken cancellationToken = default)
    {
        return await _context.Thumbnails
            .Include(t => t.ModelVersion)
            .FirstOrDefaultAsync(t => t.ModelVersionId == modelVersionId, cancellationToken);
    }

    public async Task<Thumbnail?> GetByModelHashAsync(string modelHash, CancellationToken cancellationToken = default)
    {
        return await _context.Thumbnails
            .Include(t => t.ModelVersion)
            .FirstOrDefaultAsync(t => t.ModelVersion.Files.Any(f => f.Sha256Hash == modelHash), cancellationToken);
    }

    public async Task<bool> ExistsByModelHashAsync(string modelHash, CancellationToken cancellationToken = default)
    {
        return await _context.Thumbnails
            .AnyAsync(t => t.ModelVersion.Files.Any(f => f.Sha256Hash == modelHash), cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}