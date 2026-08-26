using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

/// <summary>
/// The guard on removing an asset a project only uses through one of its scenes (prompt 13-C).
/// </summary>
/// <remarks>
/// A project's asset list is members ∪ what its scenes reference, so it holds rows that were
/// never added to it. "Remove" means remove the <b>membership</b>, and for a scene-derived row
/// there is none - so it is refused with the scene named, rather than appearing to work and
/// leaving the asset exactly where it was. Two rows that look identical in a grid and behave
/// differently on remove are worse than no list at all.
/// </remarks>
internal static class ProjectSceneDerivedAssets
{
    public static async Task<Result> RefuseIfOnlySceneDerivedAsync(
        ISceneAssetUsageRepository usage,
        int projectId,
        bool isMember,
        string assetType,
        int assetId,
        string assetName,
        CancellationToken cancellationToken)
    {
        if (isMember)
        {
            return Result.Success();
        }

        var scenes = (await usage.ScenesUsingAsync(assetType, assetId, cancellationToken))
            .Where(s => s.ProjectId == projectId)
            .ToList();

        if (scenes.Count == 0)
        {
            // Not a member and not used by a scene: nothing to remove, and nothing to explain.
            // Left as a success so removing twice stays harmless.
            return Result.Success();
        }

        return Result.Failure(new Error(
            "Project.AssetIsSceneDerived",
            $"'{assetName}' is not a member of this project - it is listed because {Describe(scenes)} use it. "
            + "Remove it from those scenes, or add it to the project first if you meant to make it a member."));
    }

    private static string Describe(IReadOnlyList<SceneUsingAsset> scenes)
        => scenes.Count == 1
            ? $"the scene '{scenes[0].SceneName}'"
            : $"the scenes {string.Join(", ", scenes.Select(s => $"'{s.SceneName}'"))}";
}
