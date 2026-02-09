using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SpriteRepository : ISpriteRepository
{
    private readonly ApplicationDbContext _context;

    public SpriteRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<Sprite> AddAsync(Sprite sprite, CancellationToken cancellationToken = default)
    {
        if (sprite == null)
            throw new ArgumentNullException(nameof(sprite));

        var entityEntry = await _context.Sprites.AddAsync(sprite, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<Sprite>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Sprites
            .AsNoTracking()
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .OrderBy(s => s.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<(IEnumerable<Sprite> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        int? packId = null, int? projectId = null, int? categoryId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Sprites.AsNoTracking().AsQueryable();

        if (packId.HasValue)
            query = query.Where(s => s.Packs.Any(p => p.Id == packId.Value));

        if (projectId.HasValue)
            query = query.Where(s => s.Projects.Any(p => p.Id == projectId.Value));

        if (categoryId.HasValue)
            query = query.Where(s => s.SpriteCategoryId == categoryId.Value);

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

    public async Task<IEnumerable<Sprite>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Sprites
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

    public async Task<Sprite?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Sprites
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<Sprite?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Sprites
            .IgnoreQueryFilters()
            .Where(s => s.IsDeleted)
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<Sprite?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.Sprites
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Name == name.Trim(), cancellationToken);
    }

    public async Task<Sprite?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return null;

        return await _context.Sprites
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.File.Sha256Hash == sha256Hash, cancellationToken);
    }

    public async Task<Sprite> UpdateAsync(Sprite sprite, CancellationToken cancellationToken = default)
    {
        if (sprite == null)
            throw new ArgumentNullException(nameof(sprite));

        _context.Sprites.Update(sprite);
        await _context.SaveChangesAsync(cancellationToken);
        
        return sprite;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Must use IgnoreQueryFilters() because the sprite may be soft-deleted (called from PermanentDeleteEntityCommandHandler)
        var sprite = await _context.Sprites
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

        if (sprite != null)
        {
            _context.Sprites.Remove(sprite);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
