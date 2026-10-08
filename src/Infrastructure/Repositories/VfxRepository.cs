using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class VfxRepository : IVfxRepository
{
    private readonly ApplicationDbContext _context;

    public VfxRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<Vfx> AddAsync(Vfx vfx, CancellationToken cancellationToken = default)
    {
        if (vfx == null)
            throw new ArgumentNullException(nameof(vfx));

        var entry = await _context.Vfx.AddAsync(vfx, cancellationToken);

        return entry.Entity;
    }

    public async Task<IEnumerable<Vfx>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Vfx
            .AsNoTracking()
            .OrderBy(v => v.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<Vfx?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Vfx
            .FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
    }

    public Task<Vfx> UpdateAsync(Vfx vfx, CancellationToken cancellationToken = default)
    {
        if (vfx == null)
            throw new ArgumentNullException(nameof(vfx));

        _context.UpdateIfDetached(vfx);

        return Task.FromResult(vfx);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var vfx = await _context.Vfx.FirstOrDefaultAsync(v => v.Id == id, cancellationToken);
        if (vfx != null)
            _context.Vfx.Remove(vfx);
    }
}
