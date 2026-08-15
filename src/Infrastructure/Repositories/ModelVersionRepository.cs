using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Infrastructure.Repositories;

internal sealed class ModelVersionRepository : IModelVersionRepository
{
    private readonly ApplicationDbContext _context;

    public ModelVersionRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ModelVersion?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .Include(v => v.Model)
                .ThenInclude(m => m.ModelCategory)
            // Pack names are denormalised onto the search projection, so the rebuild in
            // ImportModelSceneGraphCommand needs them loaded. Cheap: a model sits in a
            // handful of packs at most.
            .Include(v => v.Model)
                .ThenInclude(m => m.Packs)
            .Include(v => v.Files)
            .Include(v => v.Thumbnail)
            .Include(v => v.TextureMappings)
                .ThenInclude(m => m.TextureSet)
            .FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
    }

    public async Task<ModelVersion?> GetByModelIdAndVersionNumberAsync(
        int modelId, 
        int versionNumber, 
        CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .Include(v => v.Files)
            .Include(v => v.TextureMappings)
                .ThenInclude(m => m.TextureSet)
            .FirstOrDefaultAsync(v => v.ModelId == modelId && v.VersionNumber == versionNumber, cancellationToken);
    }

    public async Task<IReadOnlyList<ModelVersion>> GetByModelIdAsync(
        int modelId, 
        CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .AsNoTracking()
            .Include(v => v.Files)
            .Include(v => v.Thumbnail)
            .Include(v => v.TextureMappings)
                .ThenInclude(m => m.TextureSet)
            .Where(v => v.ModelId == modelId)
            .OrderBy(v => v.VersionNumber)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ModelVersion>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(v => v.IsDeleted)
            .Include(v => v.Files)
            .Include(v => v.TextureMappings)
                .ThenInclude(m => m.TextureSet)
            .OrderBy(v => v.ModelId)
            .ThenBy(v => v.VersionNumber)
            .ToListAsync(cancellationToken);
    }

    public async Task<ModelVersion?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .IgnoreQueryFilters()
            .Where(v => v.IsDeleted)
            .Include(v => v.Files)
            .Include(v => v.TextureMappings)
                .ThenInclude(m => m.TextureSet)
            .FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
    }

    public Task<ModelVersion> AddAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.ModelVersions.Add(version);
        return Task.FromResult(version);
    }

    public Task<ModelVersion> UpdateAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(version);
        return Task.FromResult(version);
    }

    public async Task SetThumbnailIdAsync(int modelVersionId, int thumbnailId, CancellationToken cancellationToken = default)
    {
        await _context.ModelVersions
            .Where(mv => mv.Id == modelVersionId)
            .ExecuteUpdateAsync(
                s => s.SetProperty(mv => mv.ThumbnailId, thumbnailId),
                cancellationToken);
    }

    // ─── ModelVersionTextureSet mapping methods ─────────────────────────
    // These stay self-committing on purpose (unlike Add/Update/Delete above,
    // which stage only and let the handler commit via IUnitOfWork): the
    // variant-aware AddTextureMappingAsync is an idempotent-insert primitive -
    // it must save immediately so it can catch the unique violation itself and
    // recover by loading the existing row. The Remove* siblings keep the same
    // immediate-commit boundary for symmetry. This is why the file remains in
    // RepositoriesDontSelfCommitTests' allowlist.
    public async Task AddTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, CancellationToken cancellationToken = default)
    {
        var mapping = ModelVersionTextureSet.Create(modelVersionId, textureSetId, materialName);
        _context.Set<ModelVersionTextureSet>().Add(mapping);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task AddTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, string variantName, CancellationToken cancellationToken = default)
    {
        var mapping = ModelVersionTextureSet.Create(modelVersionId, textureSetId, materialName, variantName);
        _context.Set<ModelVersionTextureSet>().Add(mapping);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _context.Entry(mapping).State = EntityState.Detached;
            // Mapping already exists - load it so EF Core relationship fixup keeps the entity graph consistent
            await _context.Set<ModelVersionTextureSet>()
                .FirstOrDefaultAsync(m => m.ModelVersionId == modelVersionId
                    && m.TextureSetId == textureSetId
                    && m.MaterialName == materialName
                    && m.VariantName == variantName, cancellationToken);
        }
    }

    public async Task RemoveTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, CancellationToken cancellationToken = default)
    {
        var mapping = await _context.Set<ModelVersionTextureSet>()
            .FirstOrDefaultAsync(m => m.ModelVersionId == modelVersionId 
                && m.TextureSetId == textureSetId 
                && m.MaterialName == materialName
                && m.VariantName == string.Empty, cancellationToken);
        if (mapping != null)
        {
            _context.Set<ModelVersionTextureSet>().Remove(mapping);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task RemoveTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, string variantName, CancellationToken cancellationToken = default)
    {
        variantName ??= string.Empty;
        var mapping = await _context.Set<ModelVersionTextureSet>()
            .FirstOrDefaultAsync(m => m.ModelVersionId == modelVersionId 
                && m.TextureSetId == textureSetId 
                && m.MaterialName == materialName
                && m.VariantName == variantName, cancellationToken);
        if (mapping != null)
        {
            _context.Set<ModelVersionTextureSet>().Remove(mapping);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task RemoveTextureMappingsByTextureSetIdAsync(int modelVersionId, int textureSetId, CancellationToken cancellationToken = default)
    {
        var mappings = await _context.Set<ModelVersionTextureSet>()
            .Where(m => m.ModelVersionId == modelVersionId && m.TextureSetId == textureSetId)
            .ToListAsync(cancellationToken);
        if (mappings.Any())
        {
            _context.Set<ModelVersionTextureSet>().RemoveRange(mappings);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task RemoveTextureMappingByMaterialAsync(int modelVersionId, string materialName, CancellationToken cancellationToken = default)
    {
        var mapping = await _context.Set<ModelVersionTextureSet>()
            .FirstOrDefaultAsync(m => m.ModelVersionId == modelVersionId && m.MaterialName == materialName, cancellationToken);
        if (mapping != null)
        {
            _context.Set<ModelVersionTextureSet>().Remove(mapping);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task RemoveTextureMappingByMaterialAndVariantAsync(int modelVersionId, string materialName, string variantName, CancellationToken cancellationToken = default)
    {
        variantName ??= string.Empty;
        var mapping = await _context.Set<ModelVersionTextureSet>()
            .FirstOrDefaultAsync(m => m.ModelVersionId == modelVersionId && m.MaterialName == materialName && m.VariantName == variantName, cancellationToken);
        if (mapping != null)
        {
            _context.Set<ModelVersionTextureSet>().Remove(mapping);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task RemoveTextureMappingsByVariantAsync(int modelVersionId, string variantName, CancellationToken cancellationToken = default)
    {
        variantName ??= string.Empty;
        var mappings = await _context.Set<ModelVersionTextureSet>()
            .Where(m => m.ModelVersionId == modelVersionId && m.VariantName == variantName)
            .ToListAsync(cancellationToken);
        if (mappings.Any())
        {
            _context.Set<ModelVersionTextureSet>().RemoveRange(mappings);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public Task DeleteAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.ModelVersions.Remove(version);
        return Task.CompletedTask;
    }

    public async Task<int> GetLatestVersionNumberAsync(int modelId, CancellationToken cancellationToken = default)
    {
        var latestVersion = await _context.ModelVersions
            .IgnoreQueryFilters()
            .Where(v => v.ModelId == modelId)
            .OrderByDescending(v => v.VersionNumber)
            .FirstOrDefaultAsync(cancellationToken);

        return latestVersion?.VersionNumber ?? 0;
    }
}
