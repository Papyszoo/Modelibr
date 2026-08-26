using Application.Abstractions.Messaging;
using Domain.Scenes;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

internal class GetProjectByIdQueryHandler : IQueryHandler<GetProjectByIdQuery, ProjectDetailDto>
{
    private readonly IProjectRepository _projectRepository;
    private readonly ISceneAssetUsageRepository _sceneUsage;

    public GetProjectByIdQueryHandler(
        IProjectRepository projectRepository,
        ISceneAssetUsageRepository sceneUsage)
    {
        _projectRepository = projectRepository;
        _sceneUsage = sceneUsage;
    }

    public async Task<Result<ProjectDetailDto>> Handle(GetProjectByIdQuery query, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(query.Id, cancellationToken);

        if (project == null)
        {
            return Result.Failure<ProjectDetailDto>(
                new Error("ProjectNotFound", $"Project with ID {query.Id} was not found."));
        }

        // A project's assets are its members UNION what its scenes reference (prompt 13-C).
        // Derived rather than written: swapping a candidate is what the whole Choices flow
        // IS, and join rows would leave the rejected asset a permanent member with no way to
        // tell who added it.
        var used = await _sceneUsage.ForProjectAsync(query.Id, cancellationToken);

        var projectDetailDto = new ProjectDetailDto
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            Notes = project.Notes,
            CreatedAt = project.CreatedAt,
            UpdatedAt = project.UpdatedAt,
            ModelCount = project.ModelCount,
            GlobalMaterialCount = project.GlobalMaterialCount,
            MultiModelTextureCount = project.MultiModelTextureCount,
            SpriteCount = project.SpriteCount,
            SoundCount = project.SoundCount,
            ScriptCount = project.ScriptCount,
            EnvironmentMapCount = project.EnvironmentMapCount,
            IsEmpty = project.IsEmpty,
            CustomThumbnailUrl = project.CustomThumbnailFileId.HasValue ? $"/files/{project.CustomThumbnailFileId.Value}/preview?channel=rgb" : null,
            ConceptImages = project.ConceptImages
                .OrderBy(ci => ci.SortOrder)
                .Select(ci => new ProjectConceptImageDto
                {
                    FileId = ci.FileId,
                    FileName = ci.File.OriginalFileName,
                    PreviewUrl = $"/files/{ci.FileId}/preview?channel=rgb",
                    FileUrl = $"/files/{ci.FileId}",
                    SortOrder = ci.SortOrder
                }).ToList(),
            Models = Union(
                project.Models.Select(m => new ProjectModelDto { Id = m.Id, Name = m.Name }),
                used, SceneAssetTypes.Model,
                (id, name, scenes) => new ProjectModelDto { Id = id, Name = name, UsedInScenes = scenes }),
            TextureSets = project.TextureSets.Select(ts => new ProjectTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList(),
            Sprites = Union(
                project.Sprites.Select(s => new ProjectSpriteDto { Id = s.Id, Name = s.Name }),
                used, SceneAssetTypes.Sprite,
                (id, name, scenes) => new ProjectSpriteDto { Id = id, Name = name, UsedInScenes = scenes }),
            EnvironmentMaps = Union(
                project.EnvironmentMaps.Select(e => new ProjectEnvironmentMapDto { Id = e.Id, Name = e.Name }),
                used, SceneAssetTypes.EnvironmentMap,
                (id, name, scenes) => new ProjectEnvironmentMapDto { Id = id, Name = name, UsedInScenes = scenes }),

            // Both counts, rather than quietly redefining the one the UI already shows.
            // "Is it a member" and "does this project use it" are different questions, and
            // membership is still what add-to-project refuses as a duplicate.
            ModelCountIncludingScenes = CountIncluding(project.Models.Select(m => m.Id), used, SceneAssetTypes.Model),
            SpriteCountIncludingScenes = CountIncluding(project.Sprites.Select(s => s.Id), used, SceneAssetTypes.Sprite),
            EnvironmentMapCountIncludingScenes = CountIncluding(
                project.EnvironmentMaps.Select(e => e.Id), used, SceneAssetTypes.EnvironmentMap),
        };

        return Result.Success(projectDetailDto);
    }

    /// <summary>
    /// Members, then whatever the project's scenes reference and the members do not already
    /// cover.
    /// </summary>
    /// <remarks>
    /// Provenance is part of the row, not an afterthought: two assets that look identical in a
    /// grid and behave differently on remove are worse than no list at all. A member says
    /// nothing; a scene-derived entry names the scenes, and removing it means editing those.
    /// </remarks>
    private static ICollection<T> Union<T>(
        IEnumerable<T> members,
        IReadOnlyList<ProjectSceneAssetUsage> used,
        string assetType,
        Func<int, string, IReadOnlyList<string>, T> fromScene)
        where T : IProjectAssetDto
    {
        var list = members.ToList();
        var known = list.Select(m => m.Id).ToHashSet();

        foreach (var usage in used.Where(u => string.Equals(u.AssetType, assetType, StringComparison.Ordinal)))
        {
            if (!known.Add(usage.AssetId))
            {
                continue;
            }

            // An asset a scene points at but nothing resolves is still listed: the scene can
            // still be opened and still names it, and dropping the row would make the project
            // disagree with the scene the user is looking at.
            list.Add(fromScene(usage.AssetId, usage.Name ?? $"#{usage.AssetId}", usage.SceneNames));
        }

        return list;
    }

    private static int CountIncluding(
        IEnumerable<int> memberIds, IReadOnlyList<ProjectSceneAssetUsage> used, string assetType)
    {
        var ids = memberIds.ToHashSet();
        foreach (var usage in used.Where(u => string.Equals(u.AssetType, assetType, StringComparison.Ordinal)))
        {
            ids.Add(usage.AssetId);
        }

        return ids.Count;
    }
}

/// <summary>
/// What every asset row on a project detail carries: its id, and where it came from.
/// </summary>
public interface IProjectAssetDto
{
    int Id { get; }

    /// <summary>
    /// The project's scenes that reference this asset, or empty when it is an explicit member.
    /// Non-empty means <b>remove is refused</b> - the way to drop it is to edit those scenes.
    /// </summary>
    IReadOnlyList<string> UsedInScenes { get; }
}

public record GetProjectByIdQuery(int Id) : IQuery<ProjectDetailDto>;

/// <summary>
/// Detailed DTO for single project - contains all related models, texture sets, and sprites
/// </summary>
public record ProjectDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int ModelCount { get; init; }
    public int GlobalMaterialCount { get; init; }
    public int MultiModelTextureCount { get; init; }
    public int SpriteCount { get; init; }
    public int SoundCount { get; init; }
    public int ScriptCount { get; init; }
    public int EnvironmentMapCount { get; init; }

    /// <summary>
    /// Members plus what the project's scenes reference (prompt 13-C). Beside the membership
    /// count rather than replacing it: the two answer different questions, and the UI already
    /// shows the first.
    /// </summary>
    public int ModelCountIncludingScenes { get; init; }
    public int SpriteCountIncludingScenes { get; init; }
    public int EnvironmentMapCountIncludingScenes { get; init; }

    public bool IsEmpty { get; init; }
    public string? CustomThumbnailUrl { get; init; }
    public ICollection<ProjectConceptImageDto> ConceptImages { get; init; } = new List<ProjectConceptImageDto>();
    public ICollection<ProjectModelDto> Models { get; init; } = new List<ProjectModelDto>();
    public ICollection<ProjectTextureSetDto> TextureSets { get; init; } = new List<ProjectTextureSetDto>();
    public ICollection<ProjectSpriteDto> Sprites { get; init; } = new List<ProjectSpriteDto>();
    public ICollection<ProjectEnvironmentMapDto> EnvironmentMaps { get; init; } = new List<ProjectEnvironmentMapDto>();
}

public record ProjectConceptImageDto
{
    public int FileId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string PreviewUrl { get; init; } = string.Empty;
    public string FileUrl { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

public record ProjectModelDto : IProjectAssetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;

    /// <summary>Empty for a member; the scenes that reference it otherwise.</summary>
    public IReadOnlyList<string> UsedInScenes { get; init; } = Array.Empty<string>();
}

public record ProjectTextureSetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record ProjectSpriteDto : IProjectAssetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;

    /// <summary>Empty for a member; the scenes that reference it otherwise.</summary>
    public IReadOnlyList<string> UsedInScenes { get; init; } = Array.Empty<string>();
}

public record ProjectEnvironmentMapDto : IProjectAssetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;

    /// <summary>Empty for a member; the scenes that reference it otherwise.</summary>
    public IReadOnlyList<string> UsedInScenes { get; init; } = Array.Empty<string>();
}
