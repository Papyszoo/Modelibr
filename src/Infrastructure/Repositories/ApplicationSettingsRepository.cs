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
            _context.Entry(existing).CurrentValues.SetValues(settings);
        }

        await _context.SaveChangesAsync(cancellationToken);
        return existing ?? settings;
    }
}
