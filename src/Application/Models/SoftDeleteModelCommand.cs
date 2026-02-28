using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.Models;

public record SoftDeleteModelCommand(int ModelId) : ICommand<SoftDeleteModelResponse>;

public record SoftDeleteModelResponse(bool Success, string Message);

internal sealed class SoftDeleteModelCommandHandler : ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<SoftDeleteModelCommandHandler> _logger;

    public SoftDeleteModelCommandHandler(
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        ILogger<SoftDeleteModelCommandHandler> logger)
    {
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _logger = logger;
    }

    public async Task<Result<SoftDeleteModelResponse>> Handle(SoftDeleteModelCommand request, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(request.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<SoftDeleteModelResponse>(new Error("ModelNotFound", $"Model with ID {request.ModelId} not found."));
        }

        // Cancel any pending/processing thumbnail jobs before deleting the model
        // to prevent stale jobs from clogging the worker queue
        var cancelledJobs = await _thumbnailQueue.CancelActiveJobsForModelAsync(request.ModelId, cancellationToken);
        if (cancelledJobs > 0)
        {
            _logger.LogInformation("Cancelled {Count} pending thumbnail job(s) for model {ModelId} during deletion", 
                cancelledJobs, request.ModelId);
        }

        model.SoftDelete(_dateTimeProvider.UtcNow);
        await _modelRepository.UpdateAsync(model, cancellationToken);

        return Result.Success(new SoftDeleteModelResponse(true, "Model soft deleted successfully"));
    }
}
