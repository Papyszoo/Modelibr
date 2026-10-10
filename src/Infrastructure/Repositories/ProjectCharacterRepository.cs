using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProjectCharacterRepository : IProjectCharacterRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectCharacterRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<ProjectCharacter> AddAsync(ProjectCharacter character, CancellationToken cancellationToken = default)
    {
        _context.ProjectCharacters.Add(character);
        return Task.FromResult(character);
    }

    public async Task<ProjectCharacter?> GetByIdAsync(
        int projectId,
        int characterId,
        CancellationToken cancellationToken = default)
        => await _context.ProjectCharacters
            .Include(character => character.Tags)
            .Include(character => character.Images)
                .ThenInclude(image => image.File)
            .Include(character => character.Models)
                .ThenInclude(link => link.Model)
            .Include(character => character.Abilities)
            .Include(character => character.Variants)
                .ThenInclude(variant => variant.ProjectLevel)
            .AsSplitQuery()
            .FirstOrDefaultAsync(
                character => character.Id == characterId && character.ProjectId == projectId,
                cancellationToken);

    public async Task<IEnumerable<ProjectCharacter>> GetForProjectAsync(
        int projectId,
        CancellationToken cancellationToken = default)
        => await _context.ProjectCharacters
            .AsNoTracking()
            .Include(character => character.Tags)
            .Include(character => character.Images)
                .ThenInclude(image => image.File)
            .Include(character => character.Models)
                .ThenInclude(link => link.Model)
            .Include(character => character.Abilities)
            .Include(character => character.Variants)
                .ThenInclude(variant => variant.ProjectLevel)
            .Where(character => character.ProjectId == projectId)
            .OrderBy(character => character.Name)
            .ThenBy(character => character.Id)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

    public Task UpdateAsync(ProjectCharacter character, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(character);
        return Task.CompletedTask;
    }

    public Task<bool> NameExistsAsync(
        int projectId,
        string name,
        int? excludingCharacterId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedName = name.Trim();
        return _context.ProjectCharacters.AnyAsync(
            character => character.ProjectId == projectId
                && character.Name == normalizedName
                && (!excludingCharacterId.HasValue || character.Id != excludingCharacterId.Value),
            cancellationToken);
    }

    public Task DeleteAsync(ProjectCharacter character, CancellationToken cancellationToken = default)
    {
        _context.ProjectCharacters.Remove(character);
        return Task.CompletedTask;
    }
}
