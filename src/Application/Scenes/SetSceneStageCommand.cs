using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Declares how far a scene has been taken: <c>layout</c>, <c>detail</c>, <c>lit</c> or
/// <c>dressed</c>.
///
/// The stage is a claim, not a label, and the two directions are not symmetrical. Going
/// <i>back</i> always works - that is how a scene is reopened to fix its composition. Going
/// <i>forward</i> goes through <see cref="SceneStageGate"/> in <see cref="ISceneWriter"/> and
/// is refused while the scene's own geometry contradicts it, because the whole reason to work
/// in stages is not paying for appearance work twice.
///
/// Pass <c>null</c> to stop authoring the scene in stages. That is a widening, not a
/// weakening: an unstaged scene is judged against everything at once.
/// </summary>
public sealed record SetSceneStageCommand(
    int SceneId,
    string? Stage,
    int? ExpectedRevision = null) : ICommand<SceneStageResponse>;

/// <param name="Warnings">
/// Containment findings the scene took with it - something reaching below the floor, something
/// nowhere near the rest of the scene. They do not block the advance, because nothing in the
/// document can declare a sunken floor deliberate and a gate with no answer gets worked
/// around. They are worth a look, so they are said once, here.
/// </param>
public sealed record SceneStageResponse(
    SceneSummary Scene,
    string? Stage,
    string? PreviousStage,
    IReadOnlyList<SceneFinding> Warnings);

internal sealed class SetSceneStageCommandHandler : ICommandHandler<SetSceneStageCommand, SceneStageResponse>
{
    private readonly ISceneWriter _writer;

    public SetSceneStageCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneStageResponse>> Handle(
        SetSceneStageCommand command,
        CancellationToken cancellationToken)
    {
        string? previous = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                // Checked here as well as by the document validator so the caller gets the
                // vocabulary back rather than a generic rejection of the whole document.
                if (command.Stage is not null && !SceneStages.IsStage(command.Stage))
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.UnknownStage",
                        $"'{command.Stage}' is not a scene stage. Use one of: {string.Join(", ", SceneStages.All)} - or pass none to author the scene without stages."));
                }

                previous = document.Stage;
                return Result.Success(document with { Stage = command.Stage });
            },
            cancellationToken);

        if (result.IsFailure)
        {
            return Result.Failure<SceneStageResponse>(result.Error);
        }

        return Result.Success(new SceneStageResponse(
            result.Value.View.Scene,
            command.Stage,
            previous,
            result.Value.Carried));
    }
}
