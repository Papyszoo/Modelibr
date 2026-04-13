using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class EnvironmentMapCategoryRepository : IEnvironmentMapCategoryRepository
{
    private readonly ApplicationDbContext _context;

    public EnvironmentMapCategoryRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<EnvironmentMapCategory> AddAsync(EnvironmentMapCategory category, CancellationToken cancellationToken = default)
    {
        _context.EnvironmentMapCategories.Add(category);
        await _context.SaveChangesAsync(cancellationToken);
        return category;
    }

    public async Task<IReadOnlyList<EnvironmentMapCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.EnvironmentMapCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .ToListAsync(cancellationToken);
    }

    public async Task<EnvironmentMapCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.EnvironmentMapCategories
            .Include(c => c.Children)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<EnvironmentMapCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default)
    {
        return await _context.EnvironmentMapCategories
            .FirstOrDefaultAsync(c => c.Name == name && c.ParentId == parentId, cancellationToken);
    }

    public async Task UpdateAsync(EnvironmentMapCategory category, CancellationToken cancellationToken = default)
    {
        if (_context.Entry(category).State == EntityState.Detached)
            _context.EnvironmentMapCategories.Update(category);

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(EnvironmentMapCategory category, CancellationToken cancellationToken = default)
    {
        _context.EnvironmentMapCategories.Remove(category);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
