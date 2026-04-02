using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

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

    public async Task<ModelVersion> AddAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.ModelVersions.Add(version);
        await _context.SaveChangesAsync(cancellationToken);
        return version;
    }

    public async Task<ModelVersion> UpdateAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.ModelVersions.Update(version);
        await _context.SaveChangesAsync(cancellationToken);
        return version;
    }

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
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("unique", StringComparison.OrdinalIgnoreCase) == true
                                            || ex.InnerException?.Message.Contains("duplicate", StringComparison.OrdinalIgnoreCase) == true)
        {
            _context.Entry(mapping).State = EntityState.Detached;
            // Mapping already exists — load it so EF Core relationship fixup keeps the entity graph consistent
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

    public async Task DeleteAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.ModelVersions.Remove(version);
        await _context.SaveChangesAsync(cancellationToken);
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
