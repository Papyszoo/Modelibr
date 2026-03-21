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
        var allRows = await _context.ApplicationSettings
            .OrderBy(s => s.Id)
            .ToListAsync(cancellationToken);

        var existing = allRows.FirstOrDefault();

        // Clean up duplicate rows if any (can happen from concurrent initial requests)
        if (allRows.Count > 1)
        {
            _context.ApplicationSettings.RemoveRange(allRows.Skip(1));
        }

        if (existing == null)
        {
            _context.ApplicationSettings.Add(settings);
        }
        else if (!ReferenceEquals(existing, settings))
        {
            _context.Entry(existing).CurrentValues.SetValues(settings);
        }

        await _context.SaveChangesAsync(cancellationToken);
        return existing ?? settings;
    }
}
