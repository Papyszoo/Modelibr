using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>A scene after a write, with everything the response needs already resolved.</summary>
public sealed record SceneWriteResult(
    Scene Scene,
    SceneDocument Document,
    IReadOnlyDictionary<string, SceneAssetFacts> Facts)
{
    public SceneView View => SceneViewBuilder.Build(Scene, Document, Facts);
}

/// <summary>
/// The load → parse → mutate → validate → save cycle every scene edit runs.
///
/// It exists so the rejection rule cannot be forgotten by a handler: a mutation produces a
/// candidate document, and that candidate is validated <b>before</b> it replaces the stored
/// one. A handler that mutated the document itself and saved would be one refactor away
/// from persisting a scene with two nodes sharing an id.
/// </summary>
public interface ISceneWriter
{
    /// <summary>Loads a scene and its parsed document.</summary>
    Task<Result<(Scene Scene, SceneDocument Document)>> LoadAsync(int sceneId, CancellationToken cancellationToken = default);

    /// <summary>Resolves the spatial facts for every asset a document references.</summary>
    Task<IReadOnlyDictionary<string, SceneAssetFacts>> FactsAsync(SceneDocument document, CancellationToken cancellationToken = default);

    /// <summary>
    /// Applies <paramref name="mutate"/> to the scene's document and stores the result.
    ///
    /// <paramref name="expectedRevision"/>, when given, must match the scene's current
    /// revision or the write is refused. That is what stops an agent's twentieth placement
    /// from landing on a scene the user has meanwhile edited out from under it.
    /// </summary>
    Task<Result<SceneWriteResult>> ApplyAsync(
        int sceneId,
        int? expectedRevision,
        Func<SceneDocument, Result<SceneDocument>> mutate,
        CancellationToken cancellationToken = default);
}

internal sealed class SceneWriter : ISceneWriter
{
    private readonly ISceneRepository _scenes;
    private readonly ISceneAssetFacts _facts;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SceneWriter(ISceneRepository scenes, ISceneAssetFacts facts, IDateTimeProvider dateTimeProvider)
    {
        _scenes = scenes;
        _facts = facts;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<(Scene Scene, SceneDocument Document)>> LoadAsync(
        int sceneId,
        CancellationToken cancellationToken = default)
    {
        var scene = await _scenes.GetByIdAsync(sceneId, cancellationToken);
        if (scene is null)
        {
            return Result.Failure<(Scene, SceneDocument)>(
                new Error("Scene.NotFound", $"No scene with id {sceneId}."));
        }

        var document = SceneDocumentCodec.ParseStored(scene.DocumentJson, scene.Id);
        return document.IsFailure
            ? Result.Failure<(Scene, SceneDocument)>(document.Error)
            : Result.Success((scene, document.Value));
    }

    public Task<IReadOnlyDictionary<string, SceneAssetFacts>> FactsAsync(
        SceneDocument document,
        CancellationToken cancellationToken = default)
        => _facts.ResolveAsync(SceneViewBuilder.ReferencedAssets(document), cancellationToken);

    public async Task<Result<SceneWriteResult>> ApplyAsync(
        int sceneId,
        int? expectedRevision,
        Func<SceneDocument, Result<SceneDocument>> mutate,
        CancellationToken cancellationToken = default)
    {
        var loaded = await LoadAsync(sceneId, cancellationToken);
        if (loaded.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(loaded.Error);
        }

        var (scene, current) = loaded.Value;

        if (expectedRevision is { } expected && expected != scene.Revision)
        {
            return Result.Failure<SceneWriteResult>(new Error(
                "Scene.RevisionConflict",
                $"Scene {sceneId} is at revision {scene.Revision}, not the expected {expected}. Re-read the scene before writing again - it has changed since you last saw it."));
        }

        var mutated = mutate(current);
        if (mutated.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(mutated.Error);
        }

        // The gate. Whatever a mutation produced is a *candidate*, and a candidate that
        // does not validate never reaches the database.
        var validated = SceneDocumentCodec.Validate(mutated.Value);
        if (validated.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(validated.Error);
        }

        var document = validated.Value;
        var replaced = scene.ReplaceDocument(
            SceneDocumentCodec.Serialize(document), document.SchemaVersion, _dateTimeProvider.UtcNow);
        if (replaced.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(replaced.Error);
        }

        await _scenes.UpdateAsync(scene, cancellationToken);

        var facts = await FactsAsync(document, cancellationToken);
        return Result.Success(new SceneWriteResult(scene, document, facts));
    }
}
