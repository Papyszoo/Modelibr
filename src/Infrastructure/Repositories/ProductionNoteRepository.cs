using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProductionNoteRepository : IProductionNoteRepository
{
    private readonly ApplicationDbContext _context;

    public ProductionNoteRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<ProductionNote> AddAsync(ProductionNote note, CancellationToken cancellationToken = default)
    {
        _context.ProductionNotes.Add(note);
        return Task.FromResult(note);
    }

    public async Task<ProductionNote?> GetByIdAsync(
        int projectId,
        int noteId,
        CancellationToken cancellationToken = default)
        => await _context.ProductionNotes
            .FirstOrDefaultAsync(
                note => note.Id == noteId && note.ProjectId == projectId,
                cancellationToken);

    public async Task<IEnumerable<ProductionNote>> GetForProjectAsync(
        int projectId,
        int? levelId = null,
        int? referenceImageId = null,
        bool? isPinned = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.ProductionNotes
            .AsNoTracking()
            .Where(note => note.ProjectId == projectId);

        if (levelId.HasValue)
            query = query.Where(note => note.LevelId == levelId.Value);
        if (referenceImageId.HasValue)
            query = query.Where(note => note.ReferenceImageId == referenceImageId.Value);
        if (isPinned.HasValue)
            query = query.Where(note => note.IsPinned == isPinned.Value);

        return await query
            .OrderByDescending(note => note.IsPinned)
            .ThenByDescending(note => note.UpdatedAt)
            .ThenBy(note => note.Id)
            .ToListAsync(cancellationToken);
    }

    public Task UpdateAsync(ProductionNote note, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(note);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(ProductionNote note, CancellationToken cancellationToken = default)
    {
        _context.ProductionNotes.Remove(note);
        return Task.CompletedTask;
    }
}
