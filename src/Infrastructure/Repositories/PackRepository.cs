using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public class PackRepository : IPackRepository
{
    private readonly ApplicationDbContext _context;

    public PackRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Pack> AddAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Add(pack);
        await _context.SaveChangesAsync(cancellationToken);
        return pack;
    }

    public async Task<IEnumerable<Pack>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .ToListAsync(cancellationToken);
    }

    public async Task<Pack?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
    }

    public async Task<Pack?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .FirstOrDefaultAsync(p => p.Name == name, cancellationToken);
    }

    public async Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Update(pack);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Remove(pack);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
