using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class AgentOperationLogRepository : IAgentOperationLogRepository
{
    private readonly ApplicationDbContext _context;

    public AgentOperationLogRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(AgentOperationLog log, CancellationToken cancellationToken = default)
    {
        _context.AgentOperationLogs.Add(log);
        return Task.CompletedTask;
    }

    public Task<AgentOperationLog?> GetByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default)
    {
        return _context.AgentOperationLogs
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.IdempotencyKey == idempotencyKey, cancellationToken);
    }
}
