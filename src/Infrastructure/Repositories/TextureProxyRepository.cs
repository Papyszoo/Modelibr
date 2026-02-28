using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public class TextureProxyRepository : ITextureProxyRepository
{
    private readonly ApplicationDbContext _context;

    public TextureProxyRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<TextureProxy?> GetByTextureIdAndSizeAsync(int textureId, int size, CancellationToken cancellationToken = default)
    {
        return await _context.TextureProxies
            .Include(tp => tp.File)
            .FirstOrDefaultAsync(tp => tp.TextureId == textureId && tp.Size == size, cancellationToken);
    }

    public async Task<IEnumerable<TextureProxy>> GetByTextureIdsAsync(IEnumerable<int> textureIds, CancellationToken cancellationToken = default)
    {
        var ids = textureIds.ToList();
        return await _context.TextureProxies
            .Include(tp => tp.File)
            .Where(tp => ids.Contains(tp.TextureId))
            .AsNoTracking()
            .ToListAsync(cancellationToken);
    }

    public async Task<TextureProxy> AddAsync(TextureProxy proxy, CancellationToken cancellationToken = default)
    {
        _context.TextureProxies.Add(proxy);
        await _context.SaveChangesAsync(cancellationToken);
        return proxy;
    }

    public async Task<TextureProxy> UpdateAsync(TextureProxy proxy, CancellationToken cancellationToken = default)
    {
        _context.TextureProxies.Update(proxy);
        await _context.SaveChangesAsync(cancellationToken);
        return proxy;
    }

    public async Task DeleteByTextureIdAsync(int textureId, CancellationToken cancellationToken = default)
    {
        var proxies = await _context.TextureProxies
            .Where(tp => tp.TextureId == textureId)
            .ToListAsync(cancellationToken);

        if (proxies.Count > 0)
        {
            _context.TextureProxies.RemoveRange(proxies);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
