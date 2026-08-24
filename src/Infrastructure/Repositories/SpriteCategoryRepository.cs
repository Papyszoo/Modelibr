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

    public Task<SpriteCategory> AddAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        _context.SpriteCategories.Add(category);
        return Task.FromResult(category);
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

    public Task UpdateAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(category);

        return Task.CompletedTask;
    }

    public Task DeleteAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        _context.SpriteCategories.Remove(category);
        return Task.CompletedTask;
    }

    public Task<CategoryRootInsert<SpriteCategory>> AddRootAsync(
        SpriteCategory candidate, CancellationToken cancellationToken = default)
    {
        // Case-insensitive, matching the partial unique index the database now carries on
        // roots - so the row this recovers is exactly the one the index refused to let in
        // alongside the candidate.
        return CategoryRootInserts.AddRootAsync(
            _context,
            _context.SpriteCategories,
            candidate,
            c => c.ParentId == null && c.Name.ToLower() == candidate.Name.ToLower(),
            cancellationToken);
    }
}
