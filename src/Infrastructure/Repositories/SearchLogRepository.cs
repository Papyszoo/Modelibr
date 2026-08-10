using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SearchLogRepository : ISearchLogRepository
{
    private readonly ApplicationDbContext _context;

    public SearchLogRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(SearchLog log, CancellationToken cancellationToken = default)
    {
        _context.SearchLogs.Add(log);
        return Task.CompletedTask;
    }

    public async Task<SearchLog?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.SearchLogs.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
    }

    public Task UpdateAsync(SearchLog log, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(log);
        return Task.CompletedTask;
    }
}
