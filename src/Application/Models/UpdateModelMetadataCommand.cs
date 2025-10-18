using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;
using System.Linq;

namespace Application.Models;

internal class UpdateModelMetadataCommandHandler : ICommandHandler<UpdateModelMetadataCommand, UpdateModelMetadataResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateModelMetadataCommandHandler(
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateModelMetadataResponse>> Handle(UpdateModelMetadataCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<UpdateModelMetadataResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Set geometry metadata
        model.SetGeometryMetadata(command.Vertices, command.Faces, _dateTimeProvider.UtcNow);
        
        await _modelRepository.UpdateAsync(model, cancellationToken);
        
        return Result.Success(new UpdateModelMetadataResponse(model.Id));
    }
}

public record UpdateModelMetadataCommand(int ModelId, int? Vertices, int? Faces) : ICommand<UpdateModelMetadataResponse>;

public record UpdateModelMetadataResponse(int ModelId);
