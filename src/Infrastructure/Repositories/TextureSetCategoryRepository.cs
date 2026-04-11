using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class TextureSetCategoryRepository : ITextureSetCategoryRepository
{
    private readonly ApplicationDbContext _context;

    public TextureSetCategoryRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<TextureSetCategory> AddAsync(TextureSetCategory category, CancellationToken cancellationToken = default)
    {
        _context.TextureSetCategories.Add(category);
        await _context.SaveChangesAsync(cancellationToken);
        return category;
    }

    public async Task<IReadOnlyList<TextureSetCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TextureSetCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .ToListAsync(cancellationToken);
    }

    public async Task<TextureSetCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSetCategories
            .Include(c => c.Children)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<TextureSetCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSetCategories
            .FirstOrDefaultAsync(c => c.Name == name && c.ParentId == parentId, cancellationToken);
    }

    public async Task UpdateAsync(TextureSetCategory category, CancellationToken cancellationToken = default)
    {
        if (_context.Entry(category).State == EntityState.Detached)
            _context.TextureSetCategories.Update(category);

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(TextureSetCategory category, CancellationToken cancellationToken = default)
    {
        _context.TextureSetCategories.Remove(category);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
