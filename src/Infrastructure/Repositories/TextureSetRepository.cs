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
        await _context.SaveChangesAsync(cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<TextureSet>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .AsNoTracking()
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .OrderBy(tp => tp.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<(IEnumerable<TextureSet> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        int? packId = null, int? projectId = null,
        TextureSetKind? kind = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.TextureSets.AsNoTracking().AsQueryable();

        if (packId.HasValue)
            query = query.Where(ts => ts.Packs.Any(p => p.Id == packId.Value));

        if (projectId.HasValue)
            query = query.Where(ts => ts.Projects.Any(p => p.Id == projectId.Value));

        if (kind.HasValue)
            query = query.Where(ts => ts.Kind == kind.Value);

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderBy(ts => ts.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        return (items, totalCount);
    }

    public async Task<IEnumerable<TextureSet>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(tp => tp.IsDeleted)
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
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
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);
    }

    public async Task<TextureSet?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
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
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
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
            .Include(tp => tp.ModelVersions)
                .ThenInclude(mv => mv.Model)
            .Include(tp => tp.Packs)
            .Include(tp => tp.Projects)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Textures.Any(t => t.File.Sha256Hash == sha256Hash), cancellationToken);
    }

    public async Task<TextureSet> UpdateAsync(TextureSet textureSet, CancellationToken cancellationToken = default)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        _context.TextureSets.Update(textureSet);
        await _context.SaveChangesAsync(cancellationToken);
        
        return textureSet;
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
            await _context.SaveChangesAsync(cancellationToken);
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
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}