using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.ValueObjects;
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

    public Task<TextureSetCategory> AddAsync(TextureSetCategory category, CancellationToken cancellationToken = default)
    {
        _context.TextureSetCategories.Add(category);
        return Task.FromResult(category);
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

    public async Task<IReadOnlyList<TextureSetCategory>> GetAllByKindAsync(TextureSetKind kind, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSetCategories
            .AsNoTracking()
            .Include(c => c.Children)
            .Where(c => c.Kind == kind)
            .ToListAsync(cancellationToken);
    }

    public async Task<TextureSetCategory?> GetByNameAsync(string name, int? parentId, TextureSetKind kind, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSetCategories
            .FirstOrDefaultAsync(c => c.Name == name && c.ParentId == parentId && c.Kind == kind, cancellationToken);
    }

    public Task UpdateAsync(TextureSetCategory category, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(category);

        return Task.CompletedTask;
    }

    public Task DeleteAsync(TextureSetCategory category, CancellationToken cancellationToken = default)
    {
        _context.TextureSetCategories.Remove(category);
        return Task.CompletedTask;
    }

    public Task<CategoryRootInsert<TextureSetCategory>> AddRootAsync(
        TextureSetCategory candidate, CancellationToken cancellationToken = default)
    {
        // Scoped by Kind as well as name, because this tree is partitioned: Universal
        // (Global Materials) and ModelSpecific (Multi-Model Textures) are separate types
        // that never share a vocabulary, so a "Stone" root in each is two categories, not a
        // duplicate. The database's root index is on (Kind, lower(Name)) for the same reason.
        return CategoryRootInserts.AddRootAsync(
            _context,
            _context.TextureSetCategories,
            candidate,
            c => c.ParentId == null &&
                 c.Kind == candidate.Kind &&
                 c.Name.ToLower() == candidate.Name.ToLower(),
            cancellationToken);
    }
}
