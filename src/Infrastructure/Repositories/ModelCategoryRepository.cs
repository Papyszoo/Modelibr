using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ModelCategoryRepository : IModelCategoryRepository
{
    private readonly ApplicationDbContext _context;

    public ModelCategoryRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ModelCategory> AddAsync(ModelCategory category, CancellationToken cancellationToken = default)
    {
        _context.ModelCategories.Add(category);
        await _context.SaveChangesAsync(cancellationToken);
        return category;
    }

    public async Task<IReadOnlyList<ModelCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.ModelCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .ToListAsync(cancellationToken);
    }

    public async Task<ModelCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ModelCategories
            .Include(c => c.Children)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<ModelCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default)
    {
        return await _context.ModelCategories
            .FirstOrDefaultAsync(c => c.Name == name && c.ParentId == parentId, cancellationToken);
    }

    public async Task UpdateAsync(ModelCategory category, CancellationToken cancellationToken = default)
    {
        if (_context.Entry(category).State == EntityState.Detached)
        {
            _context.ModelCategories.Update(category);
        }

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(ModelCategory category, CancellationToken cancellationToken = default)
    {
        _context.ModelCategories.Remove(category);
        await _context.SaveChangesAsync(cancellationToken);
    }
}