using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>Links a scene to a level, or clears the link with a null level id.</summary>
public sealed record SetSceneLevelCommand(
    int SceneId,
    int? ProjectLevelId,
    bool IsPrimary = false,
    int? ExpectedRevision = null) : ICommand<SetSceneLevelResponse>;

public sealed record SetSceneLevelResponse(
    int SceneId,
    int? ProjectLevelId,
    bool IsPrimaryLevelScene,
    int Revision);

internal sealed class SetSceneLevelCommandHandler
    : ICommandHandler<SetSceneLevelCommand, SetSceneLevelResponse>
{
    private readonly ISceneRepository _scenes;
    private readonly IProjectLevelRepository _levels;
    private readonly IDateTimeProvider _clock;
    private readonly ISceneDocumentCommit _commit;

    public SetSceneLevelCommandHandler(
        ISceneRepository scenes,
        IProjectLevelRepository levels,
        IDateTimeProvider clock,
        ISceneDocumentCommit commit)
    {
        _scenes = scenes;
        _levels = levels;
        _clock = clock;
        _commit = commit;
    }

    public async Task<Result<SetSceneLevelResponse>> Handle(
        SetSceneLevelCommand command,
        CancellationToken cancellationToken)
    {
        var scene = await _scenes.GetByIdAsync(command.SceneId, cancellationToken);
        if (scene is null)
            return Result.Failure<SetSceneLevelResponse>(new Error(
                "SceneNotFound", $"Scene {command.SceneId} was not found."));

        if (command.ExpectedRevision is { } expected && expected != scene.Revision)
            return Result.Failure<SetSceneLevelResponse>(new Error(
                "Scene.RevisionConflict",
                $"Scene {command.SceneId} is at revision {scene.Revision}, not the expected {expected}."));

        if (command.ProjectLevelId is null && command.IsPrimary)
            return Result.Failure<SetSceneLevelResponse>(new Error(
                "Scene.PrimaryLevelRequiresLevel",
                "A primary level scene must have a project level."));

        var isPrimary = command.ProjectLevelId.HasValue && command.IsPrimary;
        if (command.ProjectLevelId is { } requestedLevelId)
        {
            if (scene.ProjectId is not { } projectId)
                return Result.Failure<SetSceneLevelResponse>(new Error(
                    "SceneLevelProjectMismatch",
                    "A scene must belong to a project before it can belong to one of that project's levels."));

            if (await _levels.GetByIdAsync(projectId, requestedLevelId, cancellationToken) is null)
                return Result.Failure<SetSceneLevelResponse>(new Error(
                    "SceneLevelProjectMismatch",
                    $"Level {requestedLevelId} does not belong to the scene's project {projectId}."));
        }

        if (scene.ProjectLevelId == command.ProjectLevelId
            && scene.IsPrimaryLevelScene == isPrimary)
            return Result.Success(Response(scene));

        var now = _clock.UtcNow;
        if (isPrimary && command.ProjectLevelId is { } levelId)
        {
            var previousPrimary = await _scenes.GetPrimaryByLevelAsync(
                levelId,
                cancellationToken);
            if (previousPrimary is not null && previousPrimary.Id != scene.Id)
            {
                previousPrimary.SetLevel(levelId, isPrimary: false, now);
                await _scenes.UpdateAsync(previousPrimary, cancellationToken);
            }
        }

        scene.SetLevel(command.ProjectLevelId, isPrimary, now);
        await _scenes.UpdateAsync(scene, cancellationToken);

        // Owned commit, so a concurrent edit is reported as Scene.RevisionConflict rather
        // than escaping as an unhandled concurrency exception.
        var saved = await _commit.SaveAsync(cancellationToken);
        if (saved.IsFailure)
        {
            return Result.Failure<SetSceneLevelResponse>(saved.Error);
        }

        return Result.Success(Response(scene));
    }

    private static SetSceneLevelResponse Response(Domain.Models.Scene scene) => new(
        scene.Id,
        scene.ProjectLevelId,
        scene.IsPrimaryLevelScene,
        scene.Revision);
}
