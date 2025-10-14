using Application.Abstractions.Repositories;
using Stage = Domain.Models.Stage;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class StageRepository : IStageRepository
{
    private readonly ApplicationDbContext _context;

    public StageRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Stage?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Stages.FindAsync([id], cancellationToken);
    }

    public async Task<IEnumerable<Stage>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Stages
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Stage stage, CancellationToken cancellationToken = default)
    {
        await _context.Stages.AddAsync(stage, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(Stage stage, CancellationToken cancellationToken = default)
    {
        _context.Stages.Update(stage);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var stage = await GetByIdAsync(id, cancellationToken);
        if (stage != null)
        {
            _context.Stages.Remove(stage);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
