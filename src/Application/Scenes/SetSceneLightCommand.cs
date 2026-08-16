using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Adds, updates or removes one light, addressed by its id.
///
/// One tool rather than three because that is how an agent thinks about a light ("make the
/// key light warmer"), and because upsert-by-id makes a retried call converge instead of
/// stacking a second sun into the scene.
/// </summary>
/// <param name="Remove">Delete the light with this id instead of writing one.</param>
/// <param name="Exact">
/// Treat every supplied field as the whole value, so an omitted one means "null", not
/// "unchanged". Partial updates are what an agent wants ("make the key light warmer"), but
/// they make some prior states unreachable: a light that had no target or no name cannot be
/// restored by a command whose nulls mean "keep what is there". Undo sets this, because undo
/// is the one caller that knows the entire previous light and must reproduce it exactly.
/// </param>
public sealed record SetSceneLightCommand(
    int SceneId,
    string LightId,
    string? Type = null,
    Vec3? Position = null,
    double? Intensity = null,
    string? Color = null,
    Vec3? Target = null,
    string? Name = null,
    bool Remove = false,
    int? ExpectedRevision = null,
    bool Exact = false) : ICommand<SceneLightResponse>;

public sealed record SceneLightResponse(
    SceneSummary Scene,
    SceneLight? Light,
    SceneLight? PreviousLight);

internal sealed class SetSceneLightCommandHandler : ICommandHandler<SetSceneLightCommand, SceneLightResponse>
{
    private readonly ISceneWriter _writer;

    public SetSceneLightCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneLightResponse>> Handle(
        SetSceneLightCommand command,
        CancellationToken cancellationToken)
    {
        SceneLight? previous = null;
        SceneLight? current = null;

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var index = -1;
                for (var i = 0; i < document.Lights.Count; i++)
                {
                    if (document.Lights[i].Id == command.LightId)
                    {
                        index = i;
                        break;
                    }
                }

                previous = index >= 0 ? document.Lights[index] : null;

                if (command.Remove)
                {
                    if (index < 0)
                    {
                        return Result.Failure<SceneDocument>(new Error(
                            "Scene.LightNotFound", $"Scene {command.SceneId} has no light with id '{command.LightId}'."));
                    }

                    current = null;
                    return Result.Success(document with
                    {
                        Lights = document.Lights.Where((_, i) => i != index).ToList(),
                    });
                }

                // Creating needs a type; updating inherits the one already there. Guessing a
                // default here would let "make it brighter" quietly turn a spot into a point
                // light, which is a lighting change nobody asked for.
                if (previous is null && string.IsNullOrWhiteSpace(command.Type))
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.LightTypeRequired",
                        $"Light '{command.LightId}' does not exist yet, so a type is required. Known types: {string.Join(", ", SceneLightTypes.All)}."));
                }

                // Exact: the caller is stating the whole light, so a null target or name is
                // an instruction to clear it rather than a gap to fill from what is there.
                var light = command.Exact
                    ? new SceneLight(
                        command.LightId,
                        command.Type ?? previous!.Type,
                        command.Position ?? Vec3.Zero,
                        command.Intensity ?? 1.0,
                        command.Color ?? "#ffffff",
                        command.Target,
                        command.Name)
                    : new SceneLight(
                        command.LightId,
                        command.Type ?? previous!.Type,
                        command.Position ?? previous?.Position ?? Vec3.Zero,
                        command.Intensity ?? previous?.Intensity ?? 1.0,
                        command.Color ?? previous?.Color ?? "#ffffff",
                        command.Target ?? previous?.Target,
                        command.Name ?? previous?.Name);

                current = light;

                var lights = document.Lights.ToList();
                if (index >= 0)
                {
                    lights[index] = light;
                }
                else
                {
                    lights.Add(light);
                }

                return Result.Success(document with { Lights = lights });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneLightResponse>(result.Error)
            : Result.Success(new SceneLightResponse(result.Value.View.Scene, current, previous));
    }
}
