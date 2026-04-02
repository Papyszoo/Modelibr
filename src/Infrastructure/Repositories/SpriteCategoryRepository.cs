using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

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
        if (category == null)
            throw new ArgumentNullException(nameof(category));

        var entityEntry = await _context.SpriteCategories.AddAsync(category, cancellationToken);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            _context.Entry(entityEntry.Entity).State = EntityState.Detached;
            throw new ArgumentException($"A sprite category with the name '{category.Name}' already exists.");
        }
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<SpriteCategory>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.SpriteCategories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<SpriteCategory?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.SpriteCategories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<SpriteCategory?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.SpriteCategories
            .FirstOrDefaultAsync(c => c.Name == name.Trim(), cancellationToken);
    }

    public async Task<SpriteCategory> UpdateAsync(SpriteCategory category, CancellationToken cancellationToken = default)
    {
        if (category == null)
            throw new ArgumentNullException(nameof(category));

        _context.SpriteCategories.Update(category);
        await _context.SaveChangesAsync(cancellationToken);
        
        return category;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var category = await _context.SpriteCategories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (category != null)
        {
            _context.SpriteCategories.Remove(category);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
