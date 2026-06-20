using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ScriptCategoryRepository : IScriptCategoryRepository
{
    private readonly ApplicationDbContext _context;

    public ScriptCategoryRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<ScriptCategory> AddAsync(ScriptCategory category, CancellationToken cancellationToken = default)
    {
        _context.ScriptCategories.Add(category);
        await _context.SaveChangesAsync(cancellationToken);
        return category;
    }

    public async Task<IReadOnlyList<ScriptCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.ScriptCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .ToListAsync(cancellationToken);
    }

    public async Task<ScriptCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ScriptCategories
            .Include(c => c.Children)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<ScriptCategory?> GetByNameAsync(string name, int? parentId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.ScriptCategories
            .FirstOrDefaultAsync(c => c.Name == name.Trim() && c.ParentId == parentId, cancellationToken);
    }

    public async Task UpdateAsync(ScriptCategory category, CancellationToken cancellationToken = default)
    {
        if (_context.Entry(category).State == EntityState.Detached)
            _context.ScriptCategories.Update(category);

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(ScriptCategory category, CancellationToken cancellationToken = default)
    {
        _context.ScriptCategories.Remove(category);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
