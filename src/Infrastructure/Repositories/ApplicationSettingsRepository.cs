using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ApplicationSettingsRepository : IApplicationSettingsRepository
{
    private readonly ApplicationDbContext _context;

    public ApplicationSettingsRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ApplicationSettings?> GetAsync(CancellationToken cancellationToken = default)
    {
        // Always return the first (and only) settings record
        return await _context.ApplicationSettings.FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<ApplicationSettings> SaveAsync(ApplicationSettings settings, CancellationToken cancellationToken = default)
    {
        var existing = await GetAsync(cancellationToken);
        
        if (existing == null)
        {
            _context.ApplicationSettings.Add(settings);
        }
        else
        {
            // Detach the existing entity and attach the new one with the same ID
            _context.Entry(existing).State = EntityState.Detached;
            settings.GetType().GetProperty("Id")!.SetValue(settings, existing.Id);
            _context.ApplicationSettings.Update(settings);
        }

        await _context.SaveChangesAsync(cancellationToken);
        return settings;
    }
}
