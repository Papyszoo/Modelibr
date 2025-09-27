using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class TexturePackRepository : ITexturePackRepository
{
    private readonly ApplicationDbContext _context;

    public TexturePackRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<TexturePack> AddAsync(TexturePack texturePack, CancellationToken cancellationToken = default)
    {
        if (texturePack == null)
            throw new ArgumentNullException(nameof(texturePack));

        var entityEntry = await _context.TexturePacks.AddAsync(texturePack, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<TexturePack>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TexturePacks
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .OrderBy(tp => tp.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<TexturePack?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.TexturePacks
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);
    }

    public async Task<TexturePack?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.TexturePacks
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .FirstOrDefaultAsync(tp => tp.Name == name.Trim(), cancellationToken);
    }

    public async Task<TexturePack> UpdateAsync(TexturePack texturePack, CancellationToken cancellationToken = default)
    {
        if (texturePack == null)
            throw new ArgumentNullException(nameof(texturePack));

        _context.TexturePacks.Update(texturePack);
        await _context.SaveChangesAsync(cancellationToken);
        
        return texturePack;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var texturePack = await _context.TexturePacks
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);

        if (texturePack != null)
        {
            _context.TexturePacks.Remove(texturePack);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}