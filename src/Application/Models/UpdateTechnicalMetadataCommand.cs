using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class UpdateTechnicalMetadataCommandHandler : ICommandHandler<UpdateTechnicalMetadataCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTechnicalMetadataCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateTechnicalMetadataCommand command, CancellationToken cancellationToken)
    {
        var version = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
        if (version == null)
        {
            return Result.Failure(new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
        }

        version.UpdateTechnicalMetadata(
            command.MaterialNames,
            command.TriangleCount,
            command.VertexCount,
            command.MeshCount,
            command.MaterialCount,
            _dateTimeProvider.UtcNow);

        await _modelVersionRepository.UpdateAsync(version, cancellationToken);
        return Result.Success();
    }
}

public record UpdateTechnicalMetadataCommand(
    int ModelVersionId,
    List<string> MaterialNames,
    int? TriangleCount,
    int? VertexCount,
    int? MeshCount,
    int? MaterialCount) : ICommand;