using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Infrastructure.Repositories;

internal sealed class PackRepository : IPackRepository
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
            .AsNoTracking()
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .ToListAsync(cancellationToken);
    }

    public async Task<Pack?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
    }

    public async Task<Pack?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .FirstOrDefaultAsync(p => p.Name == name, cancellationToken);
    }

    public async Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        // Only call Update for detached entities; tracked entities are saved automatically
        if (_context.Entry(pack).State == Microsoft.EntityFrameworkCore.EntityState.Detached)
            _context.Packs.Update(pack);

        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsDuplicatePackModelAssociation(ex))
        {
            // Concurrent identical add requests can race on the PackModels join table.
            // Treat the duplicate insert as an idempotent no-op.
            _context.ChangeTracker.Clear();
        }
    }

    public async Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Remove(pack);
        await _context.SaveChangesAsync(cancellationToken);
    }

    private static bool IsDuplicatePackModelAssociation(DbUpdateException ex)
        => ex.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "PK_PackModels"
        };
}
