using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class AddModelToPackCommandHandler : ICommandHandler<AddModelToPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddModelToPackCommandHandler(
        IPackRepository packRepository,
        IModelRepository modelRepository,
        IBatchUploadRepository batchUploadRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _modelRepository = modelRepository;
        _batchUploadRepository = batchUploadRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddModelToPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        pack.AddModel(model, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        // Update batch upload records for this model to include pack association
        var batchUploads = await _batchUploadRepository.GetByModelIdAsync(model.Id, cancellationToken);
        foreach (var batchUpload in batchUploads)
        {
            batchUpload.UpdatePackAssociation(pack.Id);
            batchUpload.UpdateUploadType("pack");
            await _batchUploadRepository.UpdateAsync(batchUpload, cancellationToken);
        }

        return Result.Success();
    }
}

public record AddModelToPackCommand(int PackId, int ModelId) : ICommand;
