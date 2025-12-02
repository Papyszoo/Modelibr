using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

public record SoftDeleteModelCommand(int ModelId) : ICommand<SoftDeleteModelResponse>;

public record SoftDeleteModelResponse(bool Success, string Message);

internal sealed class SoftDeleteModelCommandHandler : ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SoftDeleteModelCommandHandler(
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SoftDeleteModelResponse>> Handle(SoftDeleteModelCommand request, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(request.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<SoftDeleteModelResponse>(new Error("ModelNotFound", $"Model with ID {request.ModelId} not found."));
        }

        model.SoftDelete(_dateTimeProvider.UtcNow);
        await _modelRepository.UpdateAsync(model, cancellationToken);

        return Result.Success(new SoftDeleteModelResponse(true, "Model soft deleted successfully"));
    }
}
