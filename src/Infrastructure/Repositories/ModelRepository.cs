using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;

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
}