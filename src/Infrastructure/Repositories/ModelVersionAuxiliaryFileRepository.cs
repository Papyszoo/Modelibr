using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ModelVersionAuxiliaryFileRepository : IModelVersionAuxiliaryFileRepository
{
    private readonly ApplicationDbContext _context;

    public ModelVersionAuxiliaryFileRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(ModelVersionAuxiliaryFile auxiliaryFile, CancellationToken cancellationToken = default)
    {
        // Adding the join traverses its File navigation: a newly created (detached) aux
        // file is inserted via cascade, an already-tracked existing one is just linked.
        _context.ModelVersionAuxiliaryFiles.Add(auxiliaryFile);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(int modelVersionId, string relativePath, CancellationToken cancellationToken = default)
    {
        var normalized = ModelVersionAuxiliaryFile.NormalizeRelativePath(relativePath);
        return _context.ModelVersionAuxiliaryFiles
            .AnyAsync(a => a.ModelVersionId == modelVersionId && a.RelativePath == normalized, cancellationToken);
    }

    public async Task<IReadOnlyList<ModelVersionAuxiliaryFile>> GetForVersionAsync(int modelVersionId, CancellationToken cancellationToken = default)
    {
        return await _context.ModelVersionAuxiliaryFiles
            .AsNoTracking()
            .Include(a => a.File)
            .Where(a => a.ModelVersionId == modelVersionId)
            .OrderBy(a => a.RelativePath)
            .ToListAsync(cancellationToken);
    }
}
