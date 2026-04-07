using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class AddModelConceptImageCommandHandler : ICommandHandler<AddModelConceptImageCommand>
{
    private readonly IModelRepository _modelRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddModelConceptImageCommandHandler(
        IModelRepository modelRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddModelConceptImageCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure(new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
        if (file == null)
        {
            return Result.Failure(new Error("FileNotFound", $"File with ID {command.FileId} was not found."));
        }

        model.AddConceptImage(file, _dateTimeProvider.UtcNow);
        await _modelRepository.UpdateAsync(model, cancellationToken);
        return Result.Success();
    }
}

internal sealed class RemoveModelConceptImageCommandHandler : ICommandHandler<RemoveModelConceptImageCommand>
{
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveModelConceptImageCommandHandler(
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveModelConceptImageCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure(new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        model.RemoveConceptImage(command.FileId, _dateTimeProvider.UtcNow);
        await _modelRepository.UpdateAsync(model, cancellationToken);
        return Result.Success();
    }
}

public record AddModelConceptImageCommand(int ModelId, int FileId) : ICommand;
public record RemoveModelConceptImageCommand(int ModelId, int FileId) : ICommand;