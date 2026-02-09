using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ModelRepository : IModelRepository
{
    private readonly ApplicationDbContext _context;
    private readonly IDateTimeProvider _dateTimeProvider;

    public ModelRepository(ApplicationDbContext context, IDateTimeProvider dateTimeProvider)
    {
        _context = context;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Model> AddAsync(Model model, CancellationToken cancellationToken = default)
    {
        _context.Models.Add(model);
        await _context.SaveChangesAsync(cancellationToken);
        return model;
    }

    public async Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .AsNoTracking()
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Files)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Thumbnail)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.TextureSets)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<(IEnumerable<Model> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        int? packId = null, int? projectId = null, int? textureSetId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Models.AsNoTracking().AsQueryable();

        if (packId.HasValue)
            query = query.Where(m => m.Packs.Any(p => p.Id == packId.Value));

        if (projectId.HasValue)
            query = query.Where(m => m.Projects.Any(p => p.Id == projectId.Value));

        if (textureSetId.HasValue)
            query = query.Where(m => m.TextureSets.Any(ts => ts.Id == textureSetId.Value));

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(m => m.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Files)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Thumbnail)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.TextureSets)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<Model?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Files)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Thumbnail)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.TextureSets)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
    }

    public async Task<Model?> GetByIdForAssociationAsync(int id, CancellationToken cancellationToken = default)
    {
        // Use FindAsync to return already-tracked instance if one exists,
        // avoiding tracking conflicts when Pack/Project loaded the Model via Include
        return await _context.Models.FindAsync(new object[] { id }, cancellationToken);
    }

    public async Task<Model?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Files)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Thumbnail)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.TextureSets)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Versions.Any(v => v.Files.Any(f => f.Sha256Hash == sha256Hash)), cancellationToken);
    }

    public async Task UpdateAsync(Model model, CancellationToken cancellationToken = default)
    {
        _context.Models.Update(model);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IEnumerable<Model>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(m => m.IsDeleted)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Files)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Thumbnail)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.TextureSets)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<Model?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .IgnoreQueryFilters()
            .Where(m => m.IsDeleted)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Files)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.Thumbnail)
            .Include(m => m.ActiveVersion)
                .ThenInclude(v => v.TextureSets)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        // Break the circular FK dependency between Model.ActiveVersionId and ModelVersion.ModelId
        // EF Core cannot determine deletion order with circular FKs, so we must break the cycle first
        // Use ExecuteUpdateAsync to bypass the private setter and update directly in the database
        // Must use IgnoreQueryFilters() because the model is soft-deleted (IsDeleted = true)
        await _context.Models
            .IgnoreQueryFilters()
            .Where(m => m.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ActiveVersionId, (int?)null), cancellationToken);
        
        // Detach all tracked Model and ModelVersion entities to clear stale navigation properties
        // This is necessary because EF Core's change tracker still has the old ActiveVersion reference
        foreach (var entry in _context.ChangeTracker.Entries<Model>().ToList())
        {
            entry.State = Microsoft.EntityFrameworkCore.EntityState.Detached;
        }
        foreach (var entry in _context.ChangeTracker.Entries<ModelVersion>().ToList())
        {
            entry.State = Microsoft.EntityFrameworkCore.EntityState.Detached;
        }
        
        // Reload the model with fresh data (now without the circular FK)
        // Must use IgnoreQueryFilters() because the model is soft-deleted (IsDeleted = true)
        var model = await _context.Models
            .IgnoreQueryFilters()
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Thumbnail)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (model != null)
        {
            // Get version files that are only associated with this model's versions
            foreach (var version in model.Versions)
            {
                // Version files have direct FK to version, so they're not shared
                if (version.Files.Any())
                {
                    _context.Files.RemoveRange(version.Files);
                }
                
                if (version.Thumbnail != null)
                {
                    _context.Thumbnails.Remove(version.Thumbnail);
                }
            }
            
            // Remove all versions
            _context.ModelVersions.RemoveRange(model.Versions);
            
            // Remove the model (this will also remove the many-to-many join table entries)
            _context.Models.Remove(model);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}