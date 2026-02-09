using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SoundRepository : ISoundRepository
{
    private readonly ApplicationDbContext _context;

    public SoundRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<Sound> AddAsync(Sound sound, CancellationToken cancellationToken = default)
    {
        if (sound == null)
            throw new ArgumentNullException(nameof(sound));

        var entityEntry = await _context.Sounds.AddAsync(sound, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<Sound>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Sounds
            .AsNoTracking()
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .OrderBy(s => s.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<(IEnumerable<Sound> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        int? packId = null, int? projectId = null, int? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Sounds.AsNoTracking().AsQueryable();

        if (packId.HasValue)
            query = query.Where(s => s.Packs.Any(p => p.Id == packId.Value));

        if (projectId.HasValue)
            query = query.Where(s => s.Projects.Any(p => p.Id == projectId.Value));

        if (categoryId.HasValue)
            query = query.Where(s => s.SoundCategoryId == categoryId.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(s => s.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<IEnumerable<Sound>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Sounds
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(s => s.IsDeleted)
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .OrderBy(s => s.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<Sound?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Sounds
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<Sound?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Sounds
            .IgnoreQueryFilters()
            .Where(s => s.IsDeleted)
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<Sound?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.Sounds
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Name == name.Trim(), cancellationToken);
    }

    public async Task<Sound?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return null;

        return await _context.Sounds
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.File.Sha256Hash == sha256Hash, cancellationToken);
    }

    public async Task<Sound> UpdateAsync(Sound sound, CancellationToken cancellationToken = default)
    {
        if (sound == null)
            throw new ArgumentNullException(nameof(sound));

        _context.Sounds.Update(sound);
        await _context.SaveChangesAsync(cancellationToken);
        
        return sound;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Must use IgnoreQueryFilters() because the sound may be soft-deleted (called from PermanentDeleteEntityCommandHandler)
        var sound = await _context.Sounds
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

        if (sound != null)
        {
            _context.Sounds.Remove(sound);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
