using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Reads one scene with its document, per-node footprints, overlaps and scale warnings -
/// everything an agent needs to reason about the scene without being able to look at it.
/// </summary>
public sealed record GetSceneByIdQuery(int SceneId) : IQuery<SceneView>;

internal sealed class GetSceneByIdQueryHandler : IQueryHandler<GetSceneByIdQuery, SceneView>
{
    private readonly ISceneWriter _writer;

    public GetSceneByIdQueryHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneView>> Handle(GetSceneByIdQuery query, CancellationToken cancellationToken)
    {
        var loaded = await _writer.LoadAsync(query.SceneId, cancellationToken);
        if (loaded.IsFailure)
        {
            return Result.Failure<SceneView>(loaded.Error);
        }

        var (scene, document) = loaded.Value;
        var facts = await _writer.FactsAsync(document, cancellationToken);
        return Result.Success(SceneViewBuilder.Build(scene, document, facts));
    }
}

public sealed record GetAllScenesQuery : IQuery<GetAllScenesResponse>;

public sealed record GetAllScenesResponse(IReadOnlyList<SceneSummary> Scenes);

internal sealed class GetAllScenesQueryHandler : IQueryHandler<GetAllScenesQuery, GetAllScenesResponse>
{
    private readonly ISceneRepository _scenes;

    public GetAllScenesQueryHandler(ISceneRepository scenes)
    {
        _scenes = scenes;
    }

    public async Task<Result<GetAllScenesResponse>> Handle(GetAllScenesQuery query, CancellationToken cancellationToken)
    {
        var scenes = await _scenes.GetAllAsync(cancellationToken);

        var summaries = new List<SceneSummary>();
        foreach (var scene in scenes)
        {
            // A scene whose stored document no longer parses still has to appear in the
            // list - hiding it is how a user loses a scene without being told. Its counts
            // are reported as -1 so the list is honest about not knowing rather than
            // claiming an empty scene.
            var parsed = SceneDocumentCodec.Parse(scene.DocumentJson);
            summaries.Add(parsed.IsSuccess
                ? SceneViewBuilder.Summarize(scene, parsed.Value)
                : new SceneSummary(
                    scene.Id, scene.Name, scene.Description, scene.SchemaVersion, scene.Revision,
                    NodeCount: -1, LightCount: -1, scene.CreatedAt, scene.UpdatedAt));
        }

        return Result.Success(new GetAllScenesResponse(summaries));
    }
}
