using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ModelRepository : IModelRepository
{
    private readonly ApplicationDbContext _context;

    public ModelRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Model> AddAsync(Model model, CancellationToken cancellationToken = default)
    {
        _context.Models.Add(model);
        await _context.SaveChangesAsync(cancellationToken);
        return model;
    }

    public async Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Include(m => m.Files)
            .ToListAsync(cancellationToken);
    }

    public async Task<Model?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Models
            .Include(m => m.Files)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
    }
}