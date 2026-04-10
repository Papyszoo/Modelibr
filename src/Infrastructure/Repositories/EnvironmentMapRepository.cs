using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class EnvironmentMapRepository : IEnvironmentMapRepository
{
    private readonly ApplicationDbContext _context;

    public EnvironmentMapRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<EnvironmentMap> AddAsync(EnvironmentMap environmentMap, CancellationToken cancellationToken = default)
    {
        var entry = await _context.EnvironmentMaps.AddAsync(environmentMap, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        return entry.Entity;
    }

    public async Task<IEnumerable<EnvironmentMap>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await BaseQuery()
            .AsNoTracking()
            .OrderBy(e => e.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<EnvironmentMap>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await BaseQuery(includeDeleted: true)
            .AsNoTracking()
            .Where(e => e.IsDeleted)
            .OrderBy(e => e.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<EnvironmentMap>> GetAllWithDeletedVariantsAsync(CancellationToken cancellationToken = default)
    {
        return await BaseQuery(includeDeleted: true)
            .AsNoTracking()
            .Where(e => !e.IsDeleted && e.Variants.Any(v => v.IsDeleted))
            .OrderBy(e => e.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<EnvironmentMap?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await BaseQuery()
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
    }

    public async Task<EnvironmentMap?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await BaseQuery(includeDeleted: true)
            .Where(e => e.IsDeleted)
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
    }

    public async Task<EnvironmentMap?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await BaseQuery()
            .FirstOrDefaultAsync(e => e.Name == name.Trim(), cancellationToken);
    }

    public async Task<EnvironmentMap?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return null;

        return await BaseQuery()
            .FirstOrDefaultAsync(e => e.Variants.Any(v => v.File.Sha256Hash == sha256Hash), cancellationToken);
    }

    public async Task<EnvironmentMap?> GetByVariantIdIncludingDeletedAsync(int variantId, CancellationToken cancellationToken = default)
    {
        return await BaseQuery(includeDeleted: true)
            .FirstOrDefaultAsync(e => e.Variants.Any(v => v.Id == variantId), cancellationToken);
    }

    public async Task<(IEnumerable<EnvironmentMap> Items, int TotalCount)> GetPagedAsync(
        int page,
        int pageSize,
        int? packId = null,
        int? projectId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.EnvironmentMaps.AsNoTracking().AsQueryable();

        if (packId.HasValue)
            query = query.Where(e => e.Packs.Any(p => p.Id == packId.Value));

        if (projectId.HasValue)
            query = query.Where(e => e.Projects.Any(p => p.Id == projectId.Value));

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(e => e.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(e => e.Variants)
                .ThenInclude(v => v.File)
            .Include(e => e.Packs)
            .Include(e => e.Projects)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<EnvironmentMap> UpdateAsync(EnvironmentMap environmentMap, CancellationToken cancellationToken = default)
    {
        _context.EnvironmentMaps.Update(environmentMap);
        await _context.SaveChangesAsync(cancellationToken);
        return environmentMap;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var environmentMap = await _context.EnvironmentMaps
            .IgnoreQueryFilters()
            .Include(e => e.Variants)
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (environmentMap != null)
        {
            _context.EnvironmentMaps.Remove(environmentMap);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    private IQueryable<EnvironmentMap> BaseQuery(bool includeDeleted = false)
    {
        var query = includeDeleted
            ? _context.EnvironmentMaps.IgnoreQueryFilters()
            : _context.EnvironmentMaps.AsQueryable();

        return query
            .Include(e => e.Variants)
                .ThenInclude(v => v.File)
            .Include(e => e.Packs)
            .Include(e => e.Projects)
            .AsSplitQuery();
    }
}
