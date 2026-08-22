using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class TextureSetRepository : ITextureSetRepository
{
    private readonly ApplicationDbContext _context;

    public TextureSetRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<TextureSet> AddAsync(TextureSet textureSet, CancellationToken cancellationToken = default)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        var entityEntry = await _context.TextureSets.AddAsync(textureSet, cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IReadOnlyList<string>> GetAssignedTagNamesAsync(CancellationToken cancellationToken = default)
    {
        // Respects the soft-delete global query filter on TextureSets, so only
        // tags on live sets surface as the texture-set vocabulary.
        return await _context.TextureSets
            .AsNoTracking()
            .SelectMany(ts => ts.Tags)
            .Select(tag => tag.Name)
            .Distinct()
            .OrderBy(name => name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<TextureSet>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .AsNoTracking()
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .Include(tp => tp.Tags)
            .AsSplitQuery()
            .OrderBy(tp => tp.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<(IEnumerable<TextureSet> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        IReadOnlyCollection<int>? categoryIds = null,
        IReadOnlyCollection<TextureType>? textureTypes = null,
        TextureSetKind? kind = null,
        string? searchName = null,
        int? minResolution = null,
        IReadOnlyCollection<string>? normalizedTagNames = null,
        bool? uncategorized = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.TextureSets.AsNoTracking().AsQueryable();

        if (normalizedTagNames is { Count: > 0 })
            query = query.Where(ts => ts.Tags.Any(t => normalizedTagNames.Contains(t.NormalizedName)));

        if (packIds is { Count: > 0 })
            query = query.Where(ts => ts.Packs.Any(p => packIds.Contains(p.Id)));

        if (projectIds is { Count: > 0 })
            query = query.Where(ts => ts.Projects.Any(p => projectIds.Contains(p.Id)));

        if (uncategorized == true)
            query = query.Where(ts => ts.TextureSetCategoryId == null);
        else if (categoryIds is { Count: > 0 })
            query = query.Where(ts =>
                ts.TextureSetCategoryId.HasValue &&
                categoryIds.Contains(ts.TextureSetCategoryId.Value));

        // ANY-of semantics: keep the set if it contains at least one of the
        // requested texture types.
        if (textureTypes is { Count: > 0 })
            query = query.Where(ts =>
                ts.Textures.Any(t => textureTypes.Contains(t.TextureType)));

        if (kind.HasValue)
            query = query.Where(ts => ts.Kind == kind.Value);

        // Keep the set if any texture's largest side meets the threshold
        // (e.g. minResolution=4096 → "4K and up"). NULL dimensions (unprocessed
        // or undecodable formats) compare false and are excluded.
        if (minResolution.HasValue)
            query = query.Where(ts =>
                ts.Textures.Any(t => t.Width >= minResolution.Value || t.Height >= minResolution.Value));

        // EF.Functions.ILike - case-insensitive Contains on Postgres.
        if (!string.IsNullOrWhiteSpace(searchName))
        {
            var pattern = $"%{searchName.Trim()}%";
            query = query.Where(ts => EF.Functions.ILike(ts.Name, pattern));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(ts => ts.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.Proxies)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .Include(tp => tp.Tags)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<CategoryAssetCounts> GetCategoryAssetCountsAsync(
        TextureSetKind kind, CancellationToken cancellationToken = default)
    {
        // Counts are scoped to a single kind - categories are strictly per-kind
        // (Universal vs ModelSpecific), never a shared vocabulary.
        var grouped = await _context.TextureSets
            .AsNoTracking()
            .Where(ts => ts.Kind == kind)
            .GroupBy(ts => ts.TextureSetCategoryId)
            .Select(g => new { CategoryId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var perCategory = grouped
            .Where(g => g.CategoryId.HasValue)
            .ToDictionary(g => g.CategoryId!.Value, g => g.Count);
        var uncategorized = grouped
            .Where(g => !g.CategoryId.HasValue)
            .Sum(g => g.Count);
        var total = grouped.Sum(g => g.Count);

        return new CategoryAssetCounts(perCategory, uncategorized, total);
    }

    public async Task<IEnumerable<TextureSet>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(tp => tp.IsDeleted)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .OrderBy(tp => tp.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<TextureSet?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .IgnoreQueryFilters()
            .Where(tp => tp.IsDeleted)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);
    }

    /// <summary>
    /// Deliberately bare - none of the texture, mapping, pack or tag graph the single-set
    /// read pulls. A choice card needs the id and whether there is a thumbnail.
    /// </summary>
    public async Task<IReadOnlyList<TextureSet>> GetByIdsAsync(
        IReadOnlyCollection<int> ids,
        CancellationToken cancellationToken = default)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        return await _context.TextureSets
            .AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .ToListAsync(cancellationToken);
    }

    public async Task<TextureSet?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.Proxies)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .Include(tp => tp.Tags)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);
    }

    public async Task<TextureSet?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Name == name.Trim(), cancellationToken);
    }

    public async Task<TextureSet?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return null;

        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersionMappings)
                .ThenInclude(m => m.ModelVersion).ThenInclude(mv => mv.Model)
            .Include(tp => tp.Category)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Textures.Any(t => t.File.Sha256Hash == sha256Hash), cancellationToken);
    }

    public async Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .AsNoTracking()
            .AnyAsync(ts => ts.Name == name, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .AsNoTracking()
            .Where(ts => ts.Name.StartsWith(prefix))
            .Select(ts => ts.Name)
            .ToListAsync(cancellationToken);
    }

    public Task<TextureSet> UpdateAsync(TextureSet textureSet, CancellationToken cancellationToken = default)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        _context.UpdateIfDetached(textureSet);

        return Task.FromResult(textureSet);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Must use IgnoreQueryFilters() because the texture set may be soft-deleted (called from PermanentDeleteEntityCommandHandler)
        var textureSet = await _context.TextureSets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);

        if (textureSet != null)
        {
            _context.TextureSets.Remove(textureSet);
        }
    }

    public async Task HardDeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Must use IgnoreQueryFilters() because the texture set may be soft-deleted
        var textureSet = await _context.TextureSets
            .IgnoreQueryFilters()
            .Include(tp => tp.Textures)
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);

        if (textureSet != null)
        {
            // Remove textures first (but keep the files - they're referenced by another texture set now)
            _context.Textures.RemoveRange(textureSet.Textures);
            // Remove the texture set
            _context.TextureSets.Remove(textureSet);
        }
    }
}
