using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>A scene after a write, with everything the response needs already resolved.</summary>
/// <param name="StageWarnings">
/// Containment findings a stage advance carried forward - geometry below the floor, a node
/// nowhere near the rest of the scene. Empty for every write that did not advance the stage.
/// These did not block it (nothing in the document can declare a sunken floor deliberate), so
/// they are said once, at the moment the caller committed to the stage.
/// </param>
public sealed record SceneWriteResult(
    Scene Scene,
    SceneDocument Document,
    IReadOnlyDictionary<string, SceneAssetFacts> Facts,
    IReadOnlyList<SceneFinding>? StageWarnings = null)
{
    public SceneView View => SceneViewBuilder.Build(Scene, Document, Facts);

    public IReadOnlyList<SceneFinding> Carried => StageWarnings ?? Array.Empty<SceneFinding>();
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
    /// Refuses a document that names assets which cannot be resolved.
    ///
    /// Every reference in the document is checked, not just the new ones - which is right
    /// for the one caller that has no "before" to diff against: creation. An ordinary write
    /// goes through <see cref="ApplyAsync"/>, which checks only what the write INTRODUCES,
    /// because a reference that broke after it was placed must not block the edit that
    /// removes it. On a create there is no such history: every reference is being
    /// introduced, right now, by this call.
    /// </summary>
    Task<Result> VerifyReferencesAsync(SceneDocument document, CancellationToken cancellationToken = default);

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
    ///
    /// A write that moves the document to a later <see cref="SceneStages">stage</see> is also
    /// put through <see cref="SceneStageGate"/> and refused with <c>Scene.StageBlocked</c>
    /// while the composition contradicts itself. The gate applies to every path on purpose,
    /// including a whole-document save and an undo: a document is only ever restored to a
    /// state that already passed it, so nothing legitimate is caught by it twice.
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
    private readonly ISceneAssetUsageRepository _usage;

    public SceneWriter(
        ISceneRepository scenes,
        ISceneAssetFacts facts,
        ISceneDocumentCommit commit,
        IDateTimeProvider dateTimeProvider,
        ISceneAssetUsageRepository usage)
    {
        _scenes = scenes;
        _facts = facts;
        _commit = commit;
        _dateTimeProvider = dateTimeProvider;
        _usage = usage;
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

        // Placement rules the nodes carry - a sticky ground snap, an anchor onto the node
        // below - are applied here rather than in each handler, so they hold for every write:
        // an agent's move_asset, the editor's whole-document save, and undo alike. A handler
        // that had to remember to re-apply them is a handler one refactor away from a scene
        // where the vase stays behind when the table moves.
        var facts = await FactsAsync(mutated.Value, cancellationToken);
        var placed = SceneSpatial.ResolvePlacements(current, mutated.Value, facts);

        // The gate. Whatever a mutation produced is a *candidate*, and a candidate that
        // does not validate never reaches the database.
        var validated = SceneDocumentCodec.Validate(placed);
        if (validated.IsFailure)
        {
            return Result.Failure<SceneWriteResult>(validated.Error);
        }

        var document = validated.Value;

        // Composition before colour, enforced rather than advised. A write that moves the
        // scene to a later stage is the one moment the server is entitled to ask whether the
        // composition holds, and it lives here for the same reason the placement rules do:
        // a handler that had to remember to call it is a handler one refactor away from a
        // scene that calls itself dressed while its furniture floats.
        var (blocking, carried) = SceneStageGate.Check(current, document, facts);
        if (blocking.Count > 0)
        {
            var detail = string.Join(" ", blocking.Select(f => $"[{f.Code}] {f.Message}"));
            return Result.Failure<SceneWriteResult>(new Error(
                "Scene.StageBlocked",
                $"Scene {sceneId} cannot move to the '{document.Stage}' stage while {blocking.Count} node(s) are not standing on anything: {detail} Fix the placements, or declare the ones that are meant to hang with suspended=true. The stage exists so appearance work is not done over a composition that is about to move."));
        }

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

        // The index of what this scene now points at, rebuilt from the accepted document and
        // committed with it (prompt 13-C). Here rather than in each handler for the same
        // reason the placement rules are: this is the one point every document write funnels
        // through, and a projection maintained anywhere else drifts on exactly the path
        // nobody tested.
        await _usage.ReplaceForSceneAsync(
            scene.Id, SceneAssetUsageProjection.From(scene.Id, document), cancellationToken);

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

        return Result.Success(new SceneWriteResult(scene, document, facts, carried));
    }

    public async Task<Result> VerifyReferencesAsync(
        SceneDocument document, CancellationToken cancellationToken = default)
    {
        var references = SceneViewBuilder.ReferencedAssets(document);
        if (references.Count == 0)
        {
            return Result.Success();
        }

        var problems = await _facts.FindUnresolvableAsync(references, cancellationToken);
        return problems.Count > 0
            ? Result.Failure(new Error(
                "Scene.AssetNotFound", string.Join(" ", problems.Select(p => p.Reason))))
            : Result.Success();
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
