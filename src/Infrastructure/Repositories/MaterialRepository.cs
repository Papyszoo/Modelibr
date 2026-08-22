using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class MaterialRepository : IMaterialRepository
{
    private readonly ApplicationDbContext _context;

    public MaterialRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<Material> AddAsync(Material material, CancellationToken cancellationToken = default)
    {
        if (material == null)
            throw new ArgumentNullException(nameof(material));

        var entityEntry = await _context.Materials.AddAsync(material, cancellationToken);

        return entityEntry.Entity;
    }

    public async Task<IEnumerable<Material>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Materials
            .AsNoTracking()
            .Include(m => m.Category)
            .Include(m => m.Tags)
            .AsSplitQuery()
            .OrderBy(m => m.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IEnumerable<Material>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Materials
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(m => m.IsDeleted)
            .Include(m => m.Category)
            .OrderByDescending(m => m.DeletedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<Material?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Materials
            .Include(m => m.Category)
            .Include(m => m.Tags)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
    }

    /// <summary>
    /// Deliberately bare - no category, no tags. The caller is a choice card wanting a
    /// colour and a thumbnail path, and the graph the single-material read pulls is a poor
    /// trade when a scene names a dozen of them.
    /// </summary>
    public async Task<IReadOnlyList<Material>> GetByIdsAsync(
        IReadOnlyCollection<int> ids,
        CancellationToken cancellationToken = default)
    {
        if (ids.Count == 0)
        {
            return [];
        }

        return await _context.Materials
            .AsNoTracking()
            .Where(m => ids.Contains(m.Id))
            .ToListAsync(cancellationToken);
    }

    public async Task<Material?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Materials
            .IgnoreQueryFilters()
            .Include(m => m.Category)
            .FirstOrDefaultAsync(m => m.Id == id && m.IsDeleted, cancellationToken);
    }

    public async Task<Material?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Materials
            .AsNoTracking()
            .Include(m => m.Category)
            .FirstOrDefaultAsync(m => m.Name == name, cancellationToken);
    }

    public async Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Materials.AnyAsync(m => m.Name == name, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default)
    {
        // Feeds AssetNameService's AutoRename policy, which needs every existing
        // "Oak", "Oak (2)", "Oak (3)" to pick the next free suffix.
        var pattern = $"{prefix}%";

        return await _context.Materials
            .AsNoTracking()
            .Where(m => EF.Functions.ILike(m.Name, pattern))
            .Select(m => m.Name)
            .ToListAsync(cancellationToken);
    }

    public Task<Material> UpdateAsync(Material material, CancellationToken cancellationToken = default)
    {
        if (material == null)
            throw new ArgumentNullException(nameof(material));

        _context.Materials.Update(material);

        return Task.FromResult(material);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var material = await _context.Materials
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (material != null)
            _context.Materials.Remove(material);
    }
}
