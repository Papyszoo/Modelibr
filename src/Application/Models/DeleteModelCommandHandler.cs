using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal class DeleteModelCommandHandler : ICommandHandler<DeleteModelCommand, DeleteModelResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IFileRecyclingService _fileRecyclingService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DeleteModelCommandHandler(
        IModelRepository modelRepository,
        IFileRepository fileRepository,
        IFileRecyclingService fileRecyclingService,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _fileRepository = fileRepository;
        _fileRecyclingService = fileRecyclingService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<DeleteModelResponse>> Handle(DeleteModelCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<DeleteModelResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Get all files associated with the model
        var files = await _fileRepository.GetFilesByModelIdAsync(command.ModelId, cancellationToken);
        
        // Recycle each file (move to recycle bin)
        foreach (var file in files)
        {
            await _fileRecyclingService.RecycleFileAsync(
                file, 
                $"Model '{model.Name}' (ID: {model.Id}) was deleted",
                cancellationToken);
        }

        // Delete the model
        await _modelRepository.DeleteAsync(command.ModelId, cancellationToken);

        return Result.Success(new DeleteModelResponse(command.ModelId, true));
    }
}
