using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SpriteCategoryRepository : ISpriteCategoryRepository
{
    private readonly ApplicationDbContext _context;

    public SpriteCategoryRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<SpriteCategory> AddAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        _context.SpriteCategories.Add(category);
        await _context.SaveChangesAsync(cancellationToken);
        return category;
    }

    public async Task<IReadOnlyList<SpriteCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.SpriteCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .ToListAsync(cancellationToken);
    }

    public async Task<SpriteCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.SpriteCategories
            .Include(c => c.Children)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<SpriteCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.SpriteCategories
            .FirstOrDefaultAsync(c => c.Name == name.Trim() && c.ParentId == parentId, cancellationToken);
    }

    public async Task UpdateAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        if (_context.Entry(category).State == EntityState.Detached)
            _context.SpriteCategories.Update(category);

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        _context.SpriteCategories.Remove(category);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
