using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class TextureSetRepository : ITextureSetRepository
{
    private readonly ApplicationDbContext _context;

    public TextureSetRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<TextureSet> AddAsync(TextureSet textureSet, CancellationToken cancellationToken = default)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        var entityEntry = await _context.TextureSets.AddAsync(textureSet, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        
        return entityEntry.Entity;
    }

    public async Task<IEnumerable<TextureSet>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.Models)
            .Include(tp => tp.Packs)
            .AsSplitQuery()
            .OrderBy(tp => tp.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<TextureSet?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.Models)
            .Include(tp => tp.Packs)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);
    }

    public async Task<TextureSet?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.Models)
            .Include(tp => tp.Packs)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Name == name.Trim(), cancellationToken);
    }

    public async Task<TextureSet?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(sha256Hash))
            return null;

        return await _context.TextureSets
            .Include(tp => tp.Textures)
                .ThenInclude(t => t.File)
            .Include(tp => tp.Models)
            .Include(tp => tp.Packs)
            .AsSplitQuery()
            .FirstOrDefaultAsync(tp => tp.Textures.Any(t => t.File.Sha256Hash == sha256Hash), cancellationToken);
    }

    public async Task<TextureSet> UpdateAsync(TextureSet textureSet, CancellationToken cancellationToken = default)
    {
        if (textureSet == null)
            throw new ArgumentNullException(nameof(textureSet));

        _context.TextureSets.Update(textureSet);
        await _context.SaveChangesAsync(cancellationToken);
        
        return textureSet;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var textureSet = await _context.TextureSets
            .FirstOrDefaultAsync(tp => tp.Id == id, cancellationToken);

        if (textureSet != null)
        {
            _context.TextureSets.Remove(textureSet);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}