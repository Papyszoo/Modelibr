using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Replaces a scene's lights with a rig that is known to work.
///
/// Lighting is the one part of scene authoring where an agent cannot see the result and both
/// failure modes look identical: over-lighting and ambient-only both render white. A run
/// that got it wrong three times in a row went blown out → still blown out → flat, because
/// each correction was a reasonable reaction to a symptom that does not distinguish them.
///
/// A preset ends that loop. It is not a hint in a description an agent may or may not read -
/// it is a call that produces a correct rig, and after it the scene can be adjusted from
/// something that already has form.
/// </summary>
/// <param name="Preset">One of <see cref="SceneLightingPresets"/>.</param>
/// <param name="Replace">
/// Whether the preset's lights replace the ones already there. True by default: the failure
/// this exists to fix is an accumulation of lights, and a preset that added a seventh one
/// would be a faster way to reach it.
/// </param>
public sealed record SetSceneLightingPresetCommand(
    int SceneId,
    string Preset,
    bool Replace = true,
    int? ExpectedRevision = null) : ICommand<SceneLightingPresetResponse>;

/// <summary>The rig now in the scene, and the one it replaced so the write can be reversed.</summary>
public sealed record SceneLightingPresetResponse(
    SceneSummary Scene,
    string Preset,
    IReadOnlyList<SceneLight> Lights,
    IReadOnlyList<SceneLight> Previous);

/// <summary>
/// The rigs, and what each is for.
///
/// Every one of them is <b>ambient as fill plus at least one key</b>, because that is the
/// rule an agent needs and cannot discover from a render. The numbers are the ones that
/// worked, not round ones.
/// </summary>
public static class SceneLightingPresets
{
    /// <summary>Daylit interior: a low sun through a window, ambient bounce for the shadows.</summary>
    public const string InteriorDaylight = "interior-daylight";

    /// <summary>Evening interior: dim ambient, warm practicals, one soft key so the room still reads.</summary>
    public const string InteriorEvening = "interior-evening";

    /// <summary>Product/studio: key, fill and rim on a neutral ground. For looking at one object.</summary>
    public const string Studio = "studio";

    public static readonly IReadOnlyList<string> All =
        new[] { InteriorDaylight, InteriorEvening, Studio };

    public static IReadOnlyList<SceneLight>? Rig(string preset) => preset switch
    {
        InteriorDaylight =>
        [
            new SceneLight("ambient", SceneLightTypes.Ambient, Vec3.Zero, 0.35, "#eef2ff", Name: "Sky fill"),
            new SceneLight("key", SceneLightTypes.Directional, new Vec3(6, 8, 4), 1.2, "#fff6e5", new Vec3(0, 0, 0), "Sun through the window"),
        ],

        InteriorEvening =>
        [
            new SceneLight("ambient", SceneLightTypes.Ambient, Vec3.Zero, 0.18, "#2a3350", Name: "Night fill"),
            new SceneLight("key", SceneLightTypes.Directional, new Vec3(-3, 5, 3), 0.5, "#ffd9a0", new Vec3(0, 0, 0), "Soft key"),
            new SceneLight("practical", SceneLightTypes.Point, new Vec3(1.5, 1.6, 1), 3.0, "#ffc27a", Name: "Warm practical"),
        ],

        Studio =>
        [
            new SceneLight("ambient", SceneLightTypes.Ambient, Vec3.Zero, 0.25, "#ffffff", Name: "Fill"),
            new SceneLight("key", SceneLightTypes.Directional, new Vec3(4, 5, 4), 1.3, "#ffffff", new Vec3(0, 0, 0), "Key"),
            new SceneLight("rim", SceneLightTypes.Directional, new Vec3(-4, 3, -5), 0.7, "#ffffff", new Vec3(0, 0, 0), "Rim"),
        ],

        _ => null,
    };
}

internal sealed class SetSceneLightingPresetCommandHandler
    : ICommandHandler<SetSceneLightingPresetCommand, SceneLightingPresetResponse>
{
    private readonly ISceneWriter _writer;

    public SetSceneLightingPresetCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneLightingPresetResponse>> Handle(
        SetSceneLightingPresetCommand command,
        CancellationToken cancellationToken)
    {
        if (SceneLightingPresets.Rig(command.Preset) is not { } rig)
        {
            return Result.Failure<SceneLightingPresetResponse>(new Error(
                "Scene.UnknownLightingPreset",
                $"'{command.Preset}' is not a lighting preset. Use one of: {string.Join(", ", SceneLightingPresets.All)}."));
        }

        IReadOnlyList<SceneLight> previous = Array.Empty<SceneLight>();

        var result = await _writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                previous = document.Lights ?? Array.Empty<SceneLight>();

                // Keeping means upserting by id, so calling the same preset twice is not a
                // second copy of it - the same rule set_light already follows.
                var lights = command.Replace
                    ? rig.ToList()
                    : previous
                        .Where(existing => !rig.Any(l => string.Equals(l.Id, existing.Id, StringComparison.Ordinal)))
                        .Concat(rig)
                        .ToList();

                return Result.Success(document with { Lights = lights });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneLightingPresetResponse>(result.Error)
            : Result.Success(new SceneLightingPresetResponse(
                result.Value.View.Scene, command.Preset, result.Value.Document.Lights, previous));
    }
}

/// <summary>
/// Puts a scene's whole lighting rig back as it was.
///
/// The inverse of a preset, and deliberately whole-rig: a preset replaces every light, so an
/// undo that restored them one at a time would leave behind whichever preset lights the old
/// rig had no counterpart for.
/// </summary>
public sealed record RestoreSceneLightsCommand(
    int SceneId,
    IReadOnlyList<SceneLight> Lights) : ICommand<SceneSummary>;

internal sealed class RestoreSceneLightsCommandHandler
    : ICommandHandler<RestoreSceneLightsCommand, SceneSummary>
{
    private readonly ISceneWriter _writer;

    public RestoreSceneLightsCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneSummary>> Handle(
        RestoreSceneLightsCommand command,
        CancellationToken cancellationToken)
    {
        var result = await _writer.ApplyAsync(
            command.SceneId,
            expectedRevision: null,
            document => Result.Success(document with { Lights = command.Lights ?? [] }),
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneSummary>(result.Error)
            : Result.Success(result.Value.View.Scene);
    }
}
