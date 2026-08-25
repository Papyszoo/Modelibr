using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class AddModelToPackCommandHandler : ICommandHandler<AddModelToPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public AddModelToPackCommandHandler(
        IPackRepository packRepository,
        IModelRepository modelRepository,
        IBatchUploadRepository batchUploadRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _modelRepository = modelRepository;
        _batchUploadRepository = batchUploadRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(AddModelToPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var model = await _modelRepository.GetByIdForAssociationAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        if (!pack.HasModel(model.Id))
        {
            await _packRepository.EnsureModelInPackAsync(pack.Id, model.Id, _dateTimeProvider.UtcNow, cancellationToken);

            // Search reads projection state only, so a membership change that never
            // reaches the projection is invisible until the next re-derive - which for a
            // freshly imported-then-packed model may never come.
            var names = await _packRepository.GetNamesByModelIdAsync(model.Id, cancellationToken);
            await _searchDocumentRepository.SetPacksForAssetAsync(
                ExtractionAssetTypes.Model,
                model.Id,
                names.Append(pack.Name).Distinct(StringComparer.OrdinalIgnoreCase),
                cancellationToken);
        }

        // Update batch upload records for this model to include pack association
        var batchUploads = await _batchUploadRepository.GetByModelIdAsync(model.Id, cancellationToken);
        foreach (var batchUpload in batchUploads)
        {
            if (batchUpload.PackId == pack.Id &&
                string.Equals(batchUpload.UploadType, "pack", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            batchUpload.UpdatePackAssociation(pack.Id);
            batchUpload.UpdateUploadType("pack");
            await _batchUploadRepository.UpdateAsync(batchUpload, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public record AddModelToPackCommand(int PackId, int ModelId) : ICommand;
