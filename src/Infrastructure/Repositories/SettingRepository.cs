using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SettingRepository : ISettingRepository
{
    private readonly ApplicationDbContext _context;

    public SettingRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Setting?> GetByKeyAsync(string key, CancellationToken cancellationToken = default)
    {
        return await _context.Settings
            .FirstOrDefaultAsync(s => s.Key == key, cancellationToken);
    }

    public async Task<IReadOnlyList<Setting>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Settings
            .AsNoTracking()
            .OrderBy(s => s.Key)
            .ToListAsync(cancellationToken);
    }

    public Task<Setting> AddAsync(Setting setting, CancellationToken cancellationToken = default)
    {
        _context.Settings.Add(setting);
        return Task.FromResult(setting);
    }

    public Task<Setting> UpdateAsync(Setting setting, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(setting);
        return Task.FromResult(setting);
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        var setting = await GetByKeyAsync(key, cancellationToken);
        if (setting != null)
        {
            _context.Settings.Remove(setting);
        }
    }
}
