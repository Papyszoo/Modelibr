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

    public Task<SoundCategory> AddAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        _context.SoundCategories.Add(category);
        return Task.FromResult(category);
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

    public Task UpdateAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(category);

        return Task.CompletedTask;
    }

    public Task DeleteAsync(SoundCategory category, CancellationToken cancellationToken = default)
    {
        _context.SoundCategories.Remove(category);
        return Task.CompletedTask;
    }

    public Task<CategoryRootInsert<SoundCategory>> AddRootAsync(
        SoundCategory candidate, CancellationToken cancellationToken = default)
    {
        // Case-insensitive, matching the partial unique index the database now carries on
        // roots - so the row this recovers is exactly the one the index refused to let in
        // alongside the candidate.
        return CategoryRootInserts.AddRootAsync(
            _context,
            _context.SoundCategories,
            candidate,
            c => c.ParentId == null && c.Name.ToLower() == candidate.Name.ToLower(),
            cancellationToken);
    }
}
