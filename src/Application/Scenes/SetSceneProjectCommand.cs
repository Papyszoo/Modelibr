using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Links a scene to a project, or clears the link with a null project id (prompt 13-C).
/// </summary>
/// <remarks>
/// A scene write like any other: it bumps the revision, which is what makes the editor
/// notice. A link change that left the revision alone would leave the editor showing one
/// project's brief while the agent read another's.
/// </remarks>
public sealed record SetSceneProjectCommand(int SceneId, int? ProjectId)
    : ICommand<SetSceneProjectResponse>;

/// <param name="PreviousProjectId">What the link was, so the write can be reversed.</param>
public sealed record SetSceneProjectResponse(
    int SceneId,
    int? ProjectId,
    string? ProjectName,
    int? PreviousProjectId,
    int Revision);

internal sealed class SetSceneProjectCommandHandler
    : ICommandHandler<SetSceneProjectCommand, SetSceneProjectResponse>
{
    private readonly ISceneRepository _scenes;
    private readonly IProjectRepository _projects;
    private readonly IDateTimeProvider _clock;
    private readonly ISceneDocumentCommit _commit;

    public SetSceneProjectCommandHandler(
        ISceneRepository scenes,
        IProjectRepository projects,
        IDateTimeProvider clock,
        ISceneDocumentCommit commit)
    {
        _scenes = scenes;
        _projects = projects;
        _clock = clock;
        _commit = commit;
    }

    public async Task<Result<SetSceneProjectResponse>> Handle(
        SetSceneProjectCommand command, CancellationToken cancellationToken)
    {
        var scene = await _scenes.GetByIdAsync(command.SceneId, cancellationToken);
        if (scene is null)
        {
            return Result.Failure<SetSceneProjectResponse>(
                new Error("SceneNotFound", $"Scene {command.SceneId} was not found."));
        }

        string? projectName = null;
        if (command.ProjectId is int projectId)
        {
            var project = await _projects.GetByIdAsync(projectId, cancellationToken);
            if (project is null)
            {
                return Result.Failure<SetSceneProjectResponse>(
                    new Error("ProjectNotFound", $"Project with ID {projectId} was not found."));
            }

            projectName = project.Name;
        }

        var previous = scene.ProjectId;
        if (previous == command.ProjectId)
        {
            // Already linked there. Report it without bumping the revision - an idempotent
            // call that moved the token would invalidate every open editor for no change.
            return Result.Success(new SetSceneProjectResponse(
                scene.Id, scene.ProjectId, projectName, previous, scene.Revision));
        }

        if (scene.ProjectLevelId.HasValue)
        {
            return Result.Failure<SetSceneProjectResponse>(new Error(
                "SceneLevelProjectMismatch",
                $"Scene {scene.Id} belongs to level {scene.ProjectLevelId}; unlink the level before changing its project."));
        }

        scene.SetProject(command.ProjectId, _clock.UtcNow);
        await _scenes.UpdateAsync(scene, cancellationToken);

        // Committed here rather than left to the trailing unit-of-work commit, so a write
        // that races another one is reported as Scene.RevisionConflict instead of surfacing
        // as an unhandled concurrency exception.
        var saved = await _commit.SaveAsync(cancellationToken);
        if (saved.IsFailure)
        {
            return Result.Failure<SetSceneProjectResponse>(saved.Error);
        }

        return Result.Success(new SetSceneProjectResponse(
            scene.Id, scene.ProjectId, projectName, previous, scene.Revision));
    }
}
