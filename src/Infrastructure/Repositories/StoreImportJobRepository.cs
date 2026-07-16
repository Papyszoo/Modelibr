using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class StoreImportJobRepository : IStoreImportJobRepository
{
    private readonly ApplicationDbContext _context;

    public StoreImportJobRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<StoreImportJob> AddAsync(StoreImportJob job, CancellationToken cancellationToken = default)
    {
        _context.StoreImportJobs.Add(job);
        return Task.FromResult(job);
    }

    // Tracked (not AsNoTracking): the background processor loads the job once and then
    // updates it repeatedly within the same scope, so UpdateIfDetached stays a no-op.
    public Task<StoreImportJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
        => _context.StoreImportJobs.FirstOrDefaultAsync(j => j.Id == id, cancellationToken);

    public Task UpdateAsync(StoreImportJob job, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(job);
        return Task.CompletedTask;
    }
}
