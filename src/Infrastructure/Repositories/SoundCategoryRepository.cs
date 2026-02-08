using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SoundCategoryRepository : ISoundCategoryRepository
{
    private readonly ApplicationDbContext _context;

    public SoundCategoryRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<SoundCategory> AddAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        if (category == null)
            throw new ArgumentNullException(nameof(category));

        var entityEntry = await _context.SoundCategories.AddAsync(category, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<SoundCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.SoundCategories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<SoundCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.SoundCategories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<SoundCategory?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.SoundCategories
            .FirstOrDefaultAsync(c => c.Name == name.Trim(), cancellationToken);
    }

    public async Task<SoundCategory> UpdateAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        if (category == null)
            throw new ArgumentNullException(nameof(category));

        _context.SoundCategories.Update(category);
        await _context.SaveChangesAsync(cancellationToken);
        
        return category;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var category = await _context.SoundCategories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (category != null)
        {
            _context.SoundCategories.Remove(category);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
