using Application.Abstractions.Repositories;
using EnvironmentEntity = Domain.Models.Environment;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class EnvironmentRepository : IEnvironmentRepository
{
    private readonly ApplicationDbContext _context;

    public EnvironmentRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<EnvironmentEntity?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Environments.FindAsync([id], cancellationToken);
    }

    public async Task<IEnumerable<EnvironmentEntity>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Environments
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(EnvironmentEntity environment, CancellationToken cancellationToken = default)
    {
        await _context.Environments.AddAsync(environment, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(EnvironmentEntity environment, CancellationToken cancellationToken = default)
    {
        _context.Environments.Update(environment);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var environment = await GetByIdAsync(id, cancellationToken);
        if (environment != null)
        {
            _context.Environments.Remove(environment);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
