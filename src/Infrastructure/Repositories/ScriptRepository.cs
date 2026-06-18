using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ScriptRepository : IScriptRepository
{
    private readonly ApplicationDbContext _context;

    public ScriptRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<Script> AddAsync(Script script, CancellationToken cancellationToken = default)
    {
        if (script == null)
            throw new ArgumentNullException(nameof(script));

        var entityEntry = await _context.Scripts.AddAsync(script, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);

        return entityEntry.Entity;
    }

    public async Task<IEnumerable<Script>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Scripts
            .AsNoTracking()
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .OrderBy(s => s.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<(IEnumerable<Script> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        IReadOnlyCollection<int>? categoryIds = null,
        string? searchName = null,
        string? language = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Scripts.AsNoTracking().AsQueryable();

        if (packIds is { Count: > 0 })
            query = query.Where(s => s.Packs.Any(p => packIds.Contains(p.Id)));

        if (projectIds is { Count: > 0 })
            query = query.Where(s => s.Projects.Any(p => projectIds.Contains(p.Id)));

        if (categoryIds is { Count: > 0 })
            query = query.Where(s =>
                s.ScriptCategoryId.HasValue &&
                categoryIds.Contains(s.ScriptCategoryId.Value));

        // EF.Functions.ILike — case-insensitive substring match.
        // Postgres-specific; an in-memory provider (e.g. Sqlite for unit
        // tests) will throw `The method 'ILike' cannot be translated`.
        if (!string.IsNullOrWhiteSpace(searchName))
        {
            var pattern = $"%{searchName.Trim()}%";
            query = query.Where(s => EF.Functions.ILike(s.Name, pattern));
        }

        if (!string.IsNullOrWhiteSpace(language))
            query = query.Where(s => s.Language == language);

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

    public async Task<IEnumerable<Script>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Scripts
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

    public async Task<Script?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Scripts
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<Script?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Scripts
            .IgnoreQueryFilters()
            .Where(s => s.IsDeleted)
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<Script?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.Scripts
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.Name == name.Trim(), cancellationToken);
    }

    public async Task<Script?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return null;

        return await _context.Scripts
            .Include(s => s.File)
            .Include(s => s.Category)
            .Include(s => s.Packs)
            .Include(s => s.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(s => s.File.Sha256Hash == sha256Hash, cancellationToken);
    }

    public async Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Scripts
            .AsNoTracking()
            .AnyAsync(s => s.Name == name, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default)
    {
        return await _context.Scripts
            .AsNoTracking()
            .Where(s => s.Name.StartsWith(prefix))
            .Select(s => s.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<Script> UpdateAsync(Script script, CancellationToken cancellationToken = default)
    {
        if (script == null)
            throw new ArgumentNullException(nameof(script));

        _context.Scripts.Update(script);
        await _context.SaveChangesAsync(cancellationToken);

        return script;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Must use IgnoreQueryFilters() because the script may be soft-deleted
        // (called from PermanentDeleteEntityCommandHandler).
        var script = await _context.Scripts
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

        if (script != null)
        {
            _context.Scripts.Remove(script);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
