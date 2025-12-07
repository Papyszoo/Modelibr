using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

public record SoftDeleteModelVersionCommand(int ModelId, int VersionId) : ICommand<SoftDeleteModelVersionResponse>;

public record SoftDeleteModelVersionResponse(bool Success, string Message);

internal sealed class SoftDeleteModelVersionCommandHandler : ICommandHandler<SoftDeleteModelVersionCommand, SoftDeleteModelVersionResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SoftDeleteModelVersionCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SoftDeleteModelVersionResponse>> Handle(SoftDeleteModelVersionCommand request, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(request.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<SoftDeleteModelVersionResponse>(new Error("ModelNotFound", $"Model with ID {request.ModelId} not found."));
        }

        var version = await _modelVersionRepository.GetByIdAsync(request.VersionId, cancellationToken);
        
        if (version == null)
        {
            return Result.Failure<SoftDeleteModelVersionResponse>(new Error("VersionNotFound", $"Model version with ID {request.VersionId} not found."));
        }

        if (version.ModelId != request.ModelId)
        {
            return Result.Failure<SoftDeleteModelVersionResponse>(new Error("VersionMismatch", "The version does not belong to the specified model."));
        }

        // Check if this is the last non-deleted version
        var nonDeletedVersions = await _modelVersionRepository.GetByModelIdAsync(request.ModelId, cancellationToken);
        if (nonDeletedVersions.Count <= 1)
        {
            return Result.Failure<SoftDeleteModelVersionResponse>(new Error("LastVersion", "Cannot delete the last remaining version. A model must have at least one version."));
        }

        var now = _dateTimeProvider.UtcNow;
        version.SoftDelete(now);
        await _modelVersionRepository.UpdateAsync(version, cancellationToken);

        // If this was the active version, set active to the latest non-deleted version (excluding the one just deleted)
        if (model.ActiveVersionId == request.VersionId)
        {
            var remainingVersions = nonDeletedVersions.Where(v => v.Id != request.VersionId).ToList();
            var latestVersion = remainingVersions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
            
            if (latestVersion != null)
            {
                model.SetActiveVersion(latestVersion.Id, now);
                await _modelRepository.UpdateAsync(model, cancellationToken);
            }
        }

        return Result.Success(new SoftDeleteModelVersionResponse(true, "Model version soft deleted successfully"));
    }
}
