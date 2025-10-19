using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;
using System.Linq;

namespace Application.Models;

internal class UpdateModelMetadataCommandHandler : ICommandHandler<UpdateModelMetadataCommand, UpdateModelMetadataResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IDomainEventDispatcher _domainEventDispatcher;

    public UpdateModelMetadataCommandHandler(
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider,
        IDomainEventDispatcher domainEventDispatcher)
    {
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
        _domainEventDispatcher = domainEventDispatcher;
    }

    public async Task<Result<UpdateModelMetadataResponse>> Handle(UpdateModelMetadataCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<UpdateModelMetadataResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Set geometry metadata - this will raise ModelMetadataProvidedEvent
        model.SetGeometryMetadata(command.Vertices, command.Faces, _dateTimeProvider.UtcNow);
        
        await _modelRepository.UpdateAsync(model, cancellationToken);
        
        // Publish domain events (including ModelMetadataProvidedEvent for deduplication)
        await _domainEventDispatcher.PublishAsync(model.DomainEvents, cancellationToken);
        model.ClearDomainEvents();
        
        return Result.Success(new UpdateModelMetadataResponse(model.Id));
    }
}

public record UpdateModelMetadataCommand(int ModelId, int? Vertices, int? Faces) : ICommand<UpdateModelMetadataResponse>;

public record UpdateModelMetadataResponse(int ModelId);
