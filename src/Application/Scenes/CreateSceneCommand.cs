using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Creates a scene. <paramref name="DocumentJson"/> is optional - omitting it starts from
/// an empty document at the current schema version, which is what both "New scene" in the
/// editor and an agent about to place its first asset want.
/// </summary>
/// <param name="ProjectId">
/// The project this scene is being built for. Optional - a scene without one simply gets no
/// brief, which is also what every scene that predates the link has.
/// </param>
public sealed record CreateSceneCommand(
    string Name,
    string? Description = null,
    string? DocumentJson = null,
    int? ProjectId = null) : ICommand<SceneView>;

internal sealed class CreateSceneCommandHandler : ICommandHandler<CreateSceneCommand, SceneView>
{
    private readonly ISceneRepository _scenes;
    private readonly ISceneWriter _writer;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ISceneAssetUsageRepository _usage;

    public CreateSceneCommandHandler(
        ISceneRepository scenes,
        ISceneWriter writer,
        IUnitOfWork unitOfWork,
        IDateTimeProvider dateTimeProvider,
        ISceneAssetUsageRepository usage)
    {
        _scenes = scenes;
        _writer = writer;
        _unitOfWork = unitOfWork;
        _dateTimeProvider = dateTimeProvider;
        _usage = usage;
    }

    public async Task<Result<SceneView>> Handle(CreateSceneCommand command, CancellationToken cancellationToken)
    {
        var document = SceneDocument.Empty();

        if (!string.IsNullOrWhiteSpace(command.DocumentJson))
        {
            var parsed = SceneDocumentCodec.Parse(command.DocumentJson);
            if (parsed.IsFailure)
            {
                return Result.Failure<SceneView>(parsed.Error);
            }

            document = parsed.Value;
        }

        // A supplied document may declare a stage, and creating is the one write that has no
        // "before" for the gate in SceneWriter to compare against - so it is run here against
        // the empty document a scene would otherwise start from. Without this, the whole gate
        // is one create_scene call away from being optional: a caller could hand in a room
        // full of floating furniture that calls itself dressed.
        var newFacts = await _writer.FactsAsync(document, cancellationToken);
        var (blocking, _) = SceneStageGate.Check(SceneDocument.Empty(), document, newFacts);
        if (blocking.Count > 0)
        {
            var detail = string.Join(" ", blocking.Select(f => $"[{f.Code}] {f.Message}"));
            return Result.Failure<SceneView>(new Error(
                "Scene.StageBlocked",
                $"This document cannot be created at the '{document.Stage}' stage while {blocking.Count} node(s) are not standing on anything: {detail} Fix the placements, declare the ones that are meant to hang with suspended=true, or create the scene at an earlier stage."));
        }

        var scene = Scene.Create(
            command.Name,
            SceneDocumentCodec.Serialize(document),
            document.SchemaVersion,
            _dateTimeProvider.UtcNow,
            command.Description,
            command.ProjectId);

        if (scene.IsFailure)
        {
            return Result.Failure<SceneView>(scene.Error);
        }

        await _scenes.AddAsync(scene.Value, cancellationToken);
        // Commit here rather than leaving it to the decorator: the response carries the
        // database-assigned id, which is an EF temporary placeholder until this runs.
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Creation is the one document write that does not go through SceneWriter, and it can
        // be handed a full document - so it indexes what that document references too, in a
        // second save because the rows need the id the first one assigned.
        var referenced = SceneAssetUsageProjection.From(scene.Value.Id, document);
        if (referenced.Count > 0)
        {
            await _usage.ReplaceForSceneAsync(scene.Value.Id, referenced, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return Result.Success(SceneViewBuilder.Build(scene.Value, document, newFacts));
    }
}
