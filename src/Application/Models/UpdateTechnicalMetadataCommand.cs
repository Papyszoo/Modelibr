using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class UpdateTechnicalMetadataCommandHandler : ICommandHandler<UpdateTechnicalMetadataCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateTechnicalMetadataCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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
            command.BoundingBoxX,
            command.BoundingBoxY,
            command.BoundingBoxZ,
            command.AnimationCount,
            command.AnimationNames,
            command.BoneCount,
            _dateTimeProvider.UtcNow);

        await _modelVersionRepository.UpdateAsync(version, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record UpdateTechnicalMetadataCommand(
    int ModelVersionId,
    List<string> MaterialNames,
    int? TriangleCount,
    int? VertexCount,
    int? MeshCount,
    int? MaterialCount,
    double? BoundingBoxX = null,
    double? BoundingBoxY = null,
    double? BoundingBoxZ = null,
    int? AnimationCount = null,
    List<string>? AnimationNames = null,
    int? BoneCount = null) : ICommand;