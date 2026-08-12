using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ComputeCacheRepository : IComputeCacheRepository
{
    private readonly ApplicationDbContext _context;

    public ComputeCacheRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<ComputeCacheEntry?> GetAsync(
        string geometryHash,
        int geometryHashVersion,
        string metric,
        CancellationToken cancellationToken = default)
    {
        return await _context.ComputeCacheEntries
            .FirstOrDefaultAsync(
                e => e.GeometryHash == geometryHash &&
                     e.GeometryHashVersion == geometryHashVersion &&
                     e.Metric == metric,
                cancellationToken);
    }

    public Task AddAsync(ComputeCacheEntry entry, CancellationToken cancellationToken = default)
    {
        _context.ComputeCacheEntries.Add(entry);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(ComputeCacheEntry entry, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(entry);
        return Task.CompletedTask;
    }
}
