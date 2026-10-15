using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Projects;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProjectCommentRepository : IProjectCommentRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectCommentRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<ProjectComment> AddAsync(ProjectComment comment, CancellationToken cancellationToken = default)
    {
        _context.ProjectComments.Add(comment);
        return Task.FromResult(comment);
    }

    public async Task<ProjectComment?> GetByIdAsync(
        int projectId,
        int commentId,
        CancellationToken cancellationToken = default)
        => await _context.ProjectComments
            .FirstOrDefaultAsync(
                comment => comment.Id == commentId && comment.ProjectId == projectId,
                cancellationToken);

    public async Task<IEnumerable<ProjectComment>> GetForProjectAsync(
        int projectId,
        ProjectCommentFilter filter,
        CancellationToken cancellationToken = default)
    {
        var query = _context.ProjectComments
            .AsNoTracking()
            .Where(comment => comment.ProjectId == projectId);

        if (filter.Target is { } target)
        {
            if (target.LevelId is { } levelId)
                query = query.Where(comment => comment.LevelId == levelId);
            if (target.ReferenceImageId is { } referenceImageId)
                query = query.Where(comment => comment.ReferenceImageId == referenceImageId);
            if (target.CharacterId is { } characterId)
                query = query.Where(comment => comment.CharacterId == characterId);
            if (target.ModelId is { } modelId)
                query = query.Where(comment => comment.ModelId == modelId);
            if (target.TextureSetId is { } textureSetId)
                query = query.Where(comment => comment.TextureSetId == textureSetId);
            if (target.SpriteId is { } spriteId)
                query = query.Where(comment => comment.SpriteId == spriteId);
            if (target.SoundId is { } soundId)
                query = query.Where(comment => comment.SoundId == soundId);
            if (target.EnvironmentMapId is { } environmentMapId)
                query = query.Where(comment => comment.EnvironmentMapId == environmentMapId);
            if (target.VfxId is { } vfxId)
                query = query.Where(comment => comment.VfxId == vfxId);
        }

        if (filter.IsPinned.HasValue)
            query = query.Where(comment => comment.IsPinned == filter.IsPinned.Value);
        if (filter.Status is not null)
            query = query.Where(comment => comment.Status == filter.Status);

        return await query
            .OrderByDescending(comment => comment.IsPinned)
            .ThenByDescending(comment => comment.UpdatedAt)
            .ThenBy(comment => comment.Id)
            .ToListAsync(cancellationToken);
    }

    public Task<bool> TargetExistsAsync(
        int projectId,
        ProjectCommentTarget target,
        CancellationToken cancellationToken = default)
    {
        if (target.LevelId is { } levelId)
            return _context.ProjectLevels.AnyAsync(
                level => level.Id == levelId && level.ProjectId == projectId, cancellationToken);
        if (target.ReferenceImageId is { } referenceImageId)
            return _context.ProjectConceptImages.AnyAsync(
                reference => reference.Id == referenceImageId && reference.ProjectId == projectId, cancellationToken);
        if (target.CharacterId is { } characterId)
            return _context.ProjectCharacters.AnyAsync(
                character => character.Id == characterId && character.ProjectId == projectId, cancellationToken);
        if (target.ModelId is { } modelId)
            return _context.Models.AnyAsync(model => model.Id == modelId, cancellationToken);
        if (target.TextureSetId is { } textureSetId)
            return _context.TextureSets.AnyAsync(textureSet => textureSet.Id == textureSetId, cancellationToken);
        if (target.SpriteId is { } spriteId)
            return _context.Sprites.AnyAsync(sprite => sprite.Id == spriteId, cancellationToken);
        if (target.SoundId is { } soundId)
            return _context.Sounds.AnyAsync(sound => sound.Id == soundId, cancellationToken);
        if (target.EnvironmentMapId is { } environmentMapId)
            return _context.EnvironmentMaps.AnyAsync(map => map.Id == environmentMapId, cancellationToken);
        if (target.VfxId is { } vfxId)
            return _context.Vfx.AnyAsync(vfx => vfx.Id == vfxId, cancellationToken);

        return Task.FromResult(true);
    }

    public Task UpdateAsync(ProjectComment comment, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(comment);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(ProjectComment comment, CancellationToken cancellationToken = default)
    {
        _context.ProjectComments.Remove(comment);
        return Task.CompletedTask;
    }
}
