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
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        IReadOnlyCollection<int>? categoryIds = null,
        string? searchName = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Sounds.AsNoTracking().AsQueryable();

        if (packIds is { Count: > 0 })
            query = query.Where(s => s.Packs.Any(p => packIds.Contains(p.Id)));

        if (projectIds is { Count: > 0 })
            query = query.Where(s => s.Projects.Any(p => projectIds.Contains(p.Id)));

        if (categoryIds is { Count: > 0 })
            query = query.Where(s =>
                s.SoundCategoryId.HasValue &&
                categoryIds.Contains(s.SoundCategoryId.Value));

        // EF.Functions.ILike — case-insensitive substring match.
        // Postgres-specific; an in-memory provider (e.g. Sqlite for unit
        // tests) will throw `The method 'ILike' cannot be translated`.
        if (!string.IsNullOrWhiteSpace(searchName))
        {
            var pattern = $"%{searchName.Trim()}%";
            query = query.Where(s => EF.Functions.ILike(s.Name, pattern));
        }

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

    public async Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Sounds
            .AsNoTracking()
            .AnyAsync(s => s.Name == name, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default)
    {
        return await _context.Sounds
            .AsNoTracking()
            .Where(s => s.Name.StartsWith(prefix))
            .Select(s => s.Name)
            .ToListAsync(cancellationToken);
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
