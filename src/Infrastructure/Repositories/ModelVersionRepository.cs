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
            .FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
    }

    public async Task<ModelVersion?> GetByModelIdAndVersionNumberAsync(
        int modelId, 
        int versionNumber, 
        CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .Include(v => v.Files)
            .FirstOrDefaultAsync(v => v.ModelId == modelId && v.VersionNumber == versionNumber, cancellationToken);
    }

    public async Task<IReadOnlyList<ModelVersion>> GetByModelIdAsync(
        int modelId, 
        CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersions
            .Include(v => v.Files)
            .Where(v => v.ModelId == modelId)
            .OrderBy(v => v.DisplayOrder)
            .ToListAsync(cancellationToken);
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

    public async Task DeleteAsync(ModelVersion version, CancellationToken cancellationToken = default)
    {
        _context.ModelVersions.Remove(version);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> GetLatestVersionNumberAsync(int modelId, CancellationToken cancellationToken = default)
    {
        var latestVersion = await _context.ModelVersions
            .Where(v => v.ModelId == modelId)
            .OrderByDescending(v => v.VersionNumber)
            .FirstOrDefaultAsync(cancellationToken);

        return latestVersion?.VersionNumber ?? 0;
    }
}
