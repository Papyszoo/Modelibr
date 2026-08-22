using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Projects;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Checks a scene against everything the server can know about it without looking at it.
///
/// This exists because of a specific failure: an agent built a full living room, verified it
/// with <c>get_scene</c>, and shipped a scene containing a squashed 129,693-triangle test
/// playset as a rug, a wall rotated the wrong way, and furniture floating 39 cm in the air.
/// Every number it read was consistent. The scene passed every check the MCP offered while
/// being visibly broken, so advice to "verify before finishing" made the agent <i>more</i>
/// confident in a wrong scene.
///
/// So the answer is not more advice, it is a check that fails. What it cannot see, it says.
/// </summary>
public sealed record ValidateSceneQuery(int SceneId) : IQuery<SceneValidationView>;

/// <param name="ReferenceProblems">
/// References that name nothing in the library. Kept apart from the findings because these
/// are not judgements: the node will never load, whatever the geometry says.
/// </param>
public sealed record SceneValidationView(
    SceneSummary Scene,
    string Verdict,
    IReadOnlyList<SceneFinding> Findings,
    IReadOnlyList<SceneAssetReferenceProblem> ReferenceProblems,
    SceneValidationCoverage Coverage);

internal sealed class ValidateSceneQueryHandler : IQueryHandler<ValidateSceneQuery, SceneValidationView>
{
    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;
    private readonly ISceneAssetProfiles _profiles;
    private readonly ISceneRepository _scenes;
    private readonly IProjectRepository _projects;

    public ValidateSceneQueryHandler(
        ISceneWriter writer,
        ISceneAssetFacts facts,
        ISceneAssetProfiles profiles,
        ISceneRepository scenes,
        IProjectRepository projects)
    {
        _writer = writer;
        _facts = facts;
        _profiles = profiles;
        _scenes = scenes;
        _projects = projects;
    }

    public async Task<Result<SceneValidationView>> Handle(
        ValidateSceneQuery query,
        CancellationToken cancellationToken)
    {
        var loaded = await _writer.LoadAsync(query.SceneId, cancellationToken);
        if (loaded.IsFailure)
        {
            return Result.Failure<SceneValidationView>(loaded.Error);
        }

        var (scene, document) = loaded.Value;
        var references = SceneViewBuilder.ReferencedAssets(document);

        var facts = await _writer.FactsAsync(document, cancellationToken);
        var profiles = await _profiles.ResolveAsync(references, cancellationToken);
        var problems = await _facts.FindUnresolvableAsync(references, cancellationToken);

        var constraints = await ProjectConstraintsAsync(query.SceneId, cancellationToken);

        var report = SceneValidator.Validate(document, facts, profiles, constraints);

        // A reference that names nothing is worse than any geometric finding, so it decides
        // the verdict even when the geometry is clean.
        var verdict = problems.Count > 0 ? SceneVerdicts.Errors : report.Verdict;

        return Result.Success(new SceneValidationView(
            SceneViewBuilder.Summarize(scene, document),
            verdict,
            report.Findings,
            problems,
            report.Coverage));
    }

    /// <summary>
    /// What the scene's project asks of it (prompt 13-D4), or null when it belongs to none.
    /// </summary>
    /// <remarks>
    /// Read here rather than carried on the document: the profile is context, not content.
    /// A scene moved to another project has to pick up the new project's constraints, and a
    /// copy inside the document would keep answering for the old one.
    /// </remarks>
    private async Task<SceneProjectConstraints?> ProjectConstraintsAsync(
        int sceneId, CancellationToken cancellationToken)
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
