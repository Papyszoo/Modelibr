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
        _context.SoundCategories.Add(category);
        await _context.SaveChangesAsync(cancellationToken);
        return category;
    }

    public async Task<IReadOnlyList<SoundCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.SoundCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .ToListAsync(cancellationToken);
    }

    public async Task<SoundCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.SoundCategories
            .Include(c => c.Children)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<SoundCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.SoundCategories
            .FirstOrDefaultAsync(c => c.Name == name.Trim() && c.ParentId == parentId, cancellationToken);
    }

    public async Task UpdateAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        if (_context.Entry(category).State == EntityState.Detached)
            _context.SoundCategories.Update(category);

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        _context.SoundCategories.Remove(category);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
