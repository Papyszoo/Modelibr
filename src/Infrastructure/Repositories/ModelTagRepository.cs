using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ModelTagRepository : IModelTagRepository
{
    private readonly ApplicationDbContext _context;

    public ModelTagRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<ModelTag>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.ModelTags
            .AsNoTracking()
            .OrderBy(tag => tag.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ModelTag>> GetByNormalizedNamesAsync(IReadOnlyCollection<string> normalizedNames, CancellationToken cancellationToken = default)
    {
        if (normalizedNames.Count == 0)
        {
            return Array.Empty<ModelTag>();
        }

        return await _context.ModelTags
            .Where(tag => normalizedNames.Contains(tag.NormalizedName))
            .ToListAsync(cancellationToken);
    }

    public async Task AddRangeAsync(IEnumerable<ModelTag> tags, CancellationToken cancellationToken = default)
    {
        _context.ModelTags.AddRange(tags);
        await _context.SaveChangesAsync(cancellationToken);
    }
}