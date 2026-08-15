using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Replaces a scene's whole document - the editor's save, and the escape hatch for an agent
/// that would rather compose a document than issue twenty calls.
/// </summary>
public sealed record UpdateSceneDocumentCommand(
    int SceneId,
    string DocumentJson,
    int? ExpectedRevision = null) : ICommand<SceneView>;

internal sealed class UpdateSceneDocumentCommandHandler : ICommandHandler<UpdateSceneDocumentCommand, SceneView>
{
    private readonly ISceneWriter _writer;

    public UpdateSceneDocumentCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneView>> Handle(UpdateSceneDocumentCommand command, CancellationToken cancellationToken)
    {
        // Parsed before the write rather than inside the mutation so a malformed body is
        // reported as a bad document, not as a failed edit of a good one.
        var parsed = SceneDocumentCodec.Parse(command.DocumentJson);
        if (parsed.IsFailure)
        {
            return Result.Failure<SceneView>(parsed.Error);
        }

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            _ => Result.Success(parsed.Value),
            cancellationToken);

        return result.IsFailure ? Result.Failure<SceneView>(result.Error) : Result.Success(result.Value.View);
    }
}

public sealed record RenameSceneCommand(int SceneId, string Name, string? Description = null) : ICommand<SceneSummary>;

internal sealed class RenameSceneCommandHandler : ICommandHandler<RenameSceneCommand, SceneSummary>
{
    private readonly ISceneRepository _scenes;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RenameSceneCommandHandler(ISceneRepository scenes, IDateTimeProvider dateTimeProvider)
    {
        _scenes = scenes;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SceneSummary>> Handle(RenameSceneCommand command, CancellationToken cancellationToken)
    {
        var scene = await _scenes.GetByIdAsync(command.SceneId, cancellationToken);
        if (scene is null)
        {
            return Result.Failure<SceneSummary>(new Error("Scene.NotFound", $"No scene with id {command.SceneId}."));
        }

        var now = _dateTimeProvider.UtcNow;
        var renamed = scene.Rename(command.Name, now);
        if (renamed.IsFailure)
        {
            return Result.Failure<SceneSummary>(renamed.Error);
        }

        if (command.Description is not null)
        {
            scene.Describe(command.Description, now);
        }

        await _scenes.UpdateAsync(scene, cancellationToken);

        // Renaming does not touch the document, so its counts are read straight off the
        // stored copy; a document that no longer parses reports -1 rather than blocking a
        // rename the user is quite possibly performing in order to go and fix it.
        var parsed = SceneDocumentCodec.Parse(scene.DocumentJson);
        return Result.Success(parsed.IsSuccess
            ? SceneViewBuilder.Summarize(scene, parsed.Value)
            : new SceneSummary(
                scene.Id, scene.Name, scene.Description, scene.SchemaVersion, scene.Revision,
                NodeCount: -1, LightCount: -1, scene.CreatedAt, scene.UpdatedAt));
    }
}

public sealed record DeleteSceneCommand(int SceneId) : ICommand;

internal sealed class DeleteSceneCommandHandler : ICommandHandler<DeleteSceneCommand>
{
    private readonly ISceneRepository _scenes;

    public DeleteSceneCommandHandler(ISceneRepository scenes)
    {
        _scenes = scenes;
    }

    public async Task<Result> Handle(DeleteSceneCommand command, CancellationToken cancellationToken)
    {
        var scene = await _scenes.GetByIdAsync(command.SceneId, cancellationToken);
        if (scene is null)
        {
            return Result.Failure(new Error("Scene.NotFound", $"No scene with id {command.SceneId}."));
        }

        await _scenes.DeleteAsync(command.SceneId, cancellationToken);
        return Result.Success();
    }
}
