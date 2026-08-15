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
public sealed record CreateSceneCommand(
    string Name,
    string? Description = null,
    string? DocumentJson = null) : ICommand<SceneView>;

internal sealed class CreateSceneCommandHandler : ICommandHandler<CreateSceneCommand, SceneView>
{
    private readonly ISceneRepository _scenes;
    private readonly ISceneWriter _writer;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSceneCommandHandler(
        ISceneRepository scenes,
        ISceneWriter writer,
        IUnitOfWork unitOfWork,
        IDateTimeProvider dateTimeProvider)
    {
        _scenes = scenes;
        _writer = writer;
        _unitOfWork = unitOfWork;
        _dateTimeProvider = dateTimeProvider;
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

        var scene = Scene.Create(
            command.Name,
            SceneDocumentCodec.Serialize(document),
            document.SchemaVersion,
            _dateTimeProvider.UtcNow,
            command.Description);

        if (scene.IsFailure)
        {
            return Result.Failure<SceneView>(scene.Error);
        }

        await _scenes.AddAsync(scene.Value, cancellationToken);
        // Commit here rather than leaving it to the decorator: the response carries the
        // database-assigned id, which is an EF temporary placeholder until this runs.
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var facts = await _writer.FactsAsync(document, cancellationToken);
        return Result.Success(SceneViewBuilder.Build(scene.Value, document, facts));
    }
}
