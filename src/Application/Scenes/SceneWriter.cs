using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
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
    ///
    /// Passing no expected revision means "apply to whatever is there", not "apply
    /// unconditionally": the revision is a database concurrency token, so a write that races
    /// another one still fails with <c>Scene.RevisionConflict</c> rather than silently
    /// overwriting the edit that landed first.
    /// </summary>
    /// <param name="verifyNewReferences">
    /// Whether references this write introduces must name assets that exist. On by default,
    /// so an ordinary write cannot add a node the editor will never load. Undo passes false:
    /// it restores state that was legal when it was recorded, and refusing to put a node back
    /// because its asset has since been recycled would turn a rendering problem into an
    /// un-undoable one.
    /// </param>
    Task<Result<SceneWriteResult>> ApplyAsync(
        int sceneId,
        int? expectedRevision,
        Func<SceneDocument, Result<SceneDocument>> mutate,
        CancellationToken cancellationToken = default,
        bool verifyNewReferences = true);
}

internal sealed class SceneWriter : ISceneWriter
{
    private readonly ISceneRepository _scenes;
    private readonly ISceneAssetFacts _facts;
    private readonly ISceneDocumentCommit _commit;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SceneWriter(
        ISceneRepository scenes,
        ISceneAssetFacts facts,
        ISceneDocumentCommit commit,
        IDateTimeProvider dateTimeProvider)
    {
        _scenes = scenes;
        _facts = facts;
        _commit = commit;
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
        CancellationToken cancellationToken = default,
        bool verifyNewReferences = true)
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

        // Shape is legal; now check that what it points at exists. Only references this write
        // INTRODUCES are checked: a write must not add a node the editor can never load, but a
        // reference that broke earlier - an asset the user recycled after placing it - must
        // not block the edit that removes it, or undoing a placement of a since-deleted asset
        // would be refused too.
        var introduced = verifyNewReferences ? NewReferences(current, document) : [];
        if (introduced.Count > 0)
        {
            var problems = await _facts.FindUnresolvableAsync(introduced, cancellationToken);
            if (problems.Count > 0)
            {
                var detail = string.Join(" ", problems.Select(p => p.Reason));
                return Result.Failure<SceneWriteResult>(new Error("Scene.AssetNotFound", detail));
            }
        }

        var replaced = scene.ReplaceDocument(
            SceneDocumentCodec.Serialize(document), document.SchemaVersion, _dateTimeProvider.UtcNow);
        if (replaced.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(replaced.Error);
        }

        await _scenes.UpdateAsync(scene, cancellationToken);

        // Committed here rather than left to the trailing unit-of-work commit: the revision
        // check above only compares what THIS request loaded, so two writers that both read
        // revision N both pass it and both write N+1 - and the earlier edit disappears with
        // nothing reported. The database enforces the same rule at the UPDATE, and this is
        // where that verdict is available to turn into a failed Result.
        var saved = await _commit.SaveAsync(cancellationToken);
        if (saved.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(saved.Error);
        }

        var facts = await FactsAsync(document, cancellationToken);
        return Result.Success(new SceneWriteResult(scene, document, facts));
    }

    /// <summary>Asset references present in the candidate document but not in the stored one.</summary>
    private static IReadOnlyList<SceneAssetRef> NewReferences(SceneDocument current, SceneDocument candidate)
    {
        var existing = SceneViewBuilder.ReferencedAssets(current)
            .Select(SceneSpatial.FactsKey)
            .ToHashSet(StringComparer.Ordinal);

        return SceneViewBuilder.ReferencedAssets(candidate)
            .Where(asset => !existing.Contains(SceneSpatial.FactsKey(asset)))
            .ToList();
    }
}
