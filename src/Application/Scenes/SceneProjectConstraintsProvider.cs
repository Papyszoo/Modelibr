using Application.Abstractions.Repositories;
using Domain.Projects;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// What the project a scene belongs to asks of it (prompt 13), resolved per read.
/// </summary>
/// <remarks>
/// Read rather than carried on the scene document, on purpose: the profile is <b>context, not
/// content</b>. A scene moved to another project has to pick up the new project's constraints,
/// and a copy inside the document would go on answering for the old one.
///
/// <para>
/// Shared by the validator and the choice cards so the two cannot disagree. A candidate that a
/// card calls "inside the budget" and the validator then flags as over it would be worse than
/// neither saying anything.
/// </para>
/// </remarks>
public interface ISceneProjectConstraints
{
    /// <summary>The scene's project constraints, or null when it belongs to no project.</summary>
    Task<SceneProjectConstraints?> ForSceneAsync(int sceneId, CancellationToken cancellationToken = default);
}

internal sealed class SceneProjectConstraintsProvider : ISceneProjectConstraints
{
    private readonly ISceneRepository _scenes;
    private readonly IProjectRepository _projects;

    public SceneProjectConstraintsProvider(ISceneRepository scenes, IProjectRepository projects)
    {
        _scenes = scenes;
        _projects = projects;
    }

    public async Task<SceneProjectConstraints?> ForSceneAsync(
        int sceneId, CancellationToken cancellationToken = default)
    {
        var scene = await _scenes.GetByIdAsync(sceneId, cancellationToken);
        if (scene?.ProjectId is not int projectId)
        {
            return null;
        }

        var project = await _projects.GetByIdAsync(projectId, cancellationToken);
        if (project is null)
        {
            return null;
        }

        var styles = project.ProfileValues
            .Where(v => v.Option is not null
                        && string.Equals(v.Option.Dimension, ProjectProfileDimensions.Style, StringComparison.OrdinalIgnoreCase))
            .Select(v => v.Option.Name)
            .ToList();

        var signals = ProjectStyleSignals.Merge(styles);

        return new SceneProjectConstraints(
            project.Id,
            project.Name,
            project.MaxTrianglesPerAsset,
            project.TargetSceneTriangles,
            styles,
            // The style's penalty tokens double as the "styles this project rules out" set:
            // an asset declared Realistic in a Low Poly project is exactly what they name.
            signals.PenaltyTokens,
            signals.FamilyHint);
    }
}
