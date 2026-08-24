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

    public Task<ScriptCategory> AddAsync(ScriptCategory category, CancellationToken cancellationToken = default)
    {
        _context.ScriptCategories.Add(category);
        return Task.FromResult(category);
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

    public Task UpdateAsync(ScriptCategory category, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(category);

        return Task.CompletedTask;
    }

    public Task DeleteAsync(ScriptCategory category, CancellationToken cancellationToken = default)
    {
        _context.ScriptCategories.Remove(category);
        return Task.CompletedTask;
    }

    public Task<CategoryRootInsert<ScriptCategory>> AddRootAsync(
        ScriptCategory candidate, CancellationToken cancellationToken = default)
    {
        // Case-insensitive, matching the partial unique index the database now carries on
        // roots - so the row this recovers is exactly the one the index refused to let in
        // alongside the candidate.
        return CategoryRootInserts.AddRootAsync(
            _context,
            _context.ScriptCategories,
            candidate,
            c => c.ParentId == null && c.Name.ToLower() == candidate.Name.ToLower(),
            cancellationToken);
    }
}
