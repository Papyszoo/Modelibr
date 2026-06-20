using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ScriptTemplateRepository : IScriptTemplateRepository
{
    private readonly ApplicationDbContext _context;

    public ScriptTemplateRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<ScriptTemplate> AddAsync(ScriptTemplate template, CancellationToken cancellationToken = default)
    {
        var entry = await _context.ScriptTemplates.AddAsync(template, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        return entry.Entity;
    }

    public async Task<IEnumerable<ScriptTemplate>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.ScriptTemplates
            .AsNoTracking()
            .OrderBy(t => t.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<ScriptTemplate?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.ScriptTemplates
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
    }

    public async Task<ScriptTemplate> UpdateAsync(ScriptTemplate template, CancellationToken cancellationToken = default)
    {
        _context.ScriptTemplates.Update(template);
        await _context.SaveChangesAsync(cancellationToken);
        return template;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var template = await _context.ScriptTemplates
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

        if (template != null)
        {
            _context.ScriptTemplates.Remove(template);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
