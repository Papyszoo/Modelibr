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

    public async Task<Model> AddFileAsync(int modelId, Domain.Models.File file, CancellationToken cancellationToken = default)
    {
        var model = await _context.Models
            .Include(m => m.Files)
            .Include(m => m.TextureSets)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.Thumbnail)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == modelId, cancellationToken);
        
        if (model == null)
        {
            throw new ArgumentException($"Model with ID {modelId} not found", nameof(modelId));
        }

        // Add the file to the database first
        _context.Files.Add(file);
        await _context.SaveChangesAsync(cancellationToken);

        // Add the file to the model using domain method
        model.AddFile(file, _dateTimeProvider.UtcNow);
        
        await _context.SaveChangesAsync(cancellationToken);
        
        return model;
    }

    public async Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Where(m => !m.IsDeleted)
            .Include(m => m.Files)
            .Include(m => m.TextureSets)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.Thumbnail)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<Model?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Where(m => !m.IsDeleted)
            .Include(m => m.Files)
            .Include(m => m.TextureSets)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.Thumbnail)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
    }

    public async Task<Model?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Where(m => !m.IsDeleted)
            .Include(m => m.Files)
            .Include(m => m.TextureSets)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.Thumbnail)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Files.Any(f => f.Sha256Hash == sha256Hash), cancellationToken);
    }

    public async Task UpdateAsync(Model model, CancellationToken cancellationToken = default)
    {
        _context.Models.Update(model);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IEnumerable<Model>> GetAllDeletedAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Where(m => m.IsDeleted)
            .Include(m => m.Files)
            .Include(m => m.TextureSets)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.Thumbnail)
            .Include(m => m.Versions)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<Model?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Where(m => m.IsDeleted)
            .Include(m => m.Files)
                .ThenInclude(f => f.Models)
            .Include(m => m.TextureSets)
            .Include(m => m.Packs)
            .Include(m => m.Projects)
            .Include(m => m.Thumbnail)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var model = await _context.Models
            .Include(m => m.Files)
                .ThenInclude(f => f.Models)
            .Include(m => m.Versions)
                .ThenInclude(v => v.Files)
            .Include(m => m.Thumbnail)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (model != null)
        {
            // Get files that are only associated with this model (not shared with others)
            var filesToDelete = model.Files
                .Where(f => f.Models.Count == 1 && f.Models.First().Id == model.Id)
                .ToList();
            
            // Remove files that are not shared
            if (filesToDelete.Any())
            {
                _context.Files.RemoveRange(filesToDelete);
            }
            
            // Get version files that are only associated with this model's versions
            foreach (var version in model.Versions)
            {
                // Version files have direct FK to version, so they're not shared
                if (version.Files.Any())
                {
                    _context.Files.RemoveRange(version.Files);
                }
            }
            
            // Remove all versions
            _context.ModelVersions.RemoveRange(model.Versions);
            
            // Remove thumbnail if exists
            if (model.Thumbnail != null)
            {
                _context.Thumbnails.Remove(model.Thumbnail);
            }
            
            // Remove the model (this will also remove the many-to-many join table entries)
            _context.Models.Remove(model);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}