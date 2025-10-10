using Application.Abstractions.Repositories;
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

    public async Task<Domain.Models.Environment> AddAsync(Domain.Models.Environment environment, CancellationToken cancellationToken = default)
    {
        _context.Environments.Add(environment);
        await _context.SaveChangesAsync(cancellationToken);
        return environment;
    }

    public async Task<IEnumerable<Domain.Models.Environment>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Environments
            .OrderByDescending(e => e.IsDefault)
            .ThenBy(e => e.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<Domain.Models.Environment?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Environments
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
    }

    public async Task<Domain.Models.Environment?> GetDefaultAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Environments
            .FirstOrDefaultAsync(e => e.IsDefault, cancellationToken);
    }

    public async Task<Domain.Models.Environment?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Environments
            .FirstOrDefaultAsync(e => e.Name == name, cancellationToken);
    }

    public async Task UpdateAsync(Domain.Models.Environment environment, CancellationToken cancellationToken = default)
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
