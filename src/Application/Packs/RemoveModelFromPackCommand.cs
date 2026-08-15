using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class RemoveModelFromPackCommandHandler : ICommandHandler<RemoveModelFromPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveModelFromPackCommandHandler(
        IPackRepository packRepository,
        IModelRepository modelRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _modelRepository = modelRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(RemoveModelFromPackCommand command, CancellationToken cancellationToken)
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

        pack.RemoveModel(model, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        // Mirror the membership change onto the search projection - see
        // IAssetSearchDocumentRepository.SetPacksForAssetAsync.
        var names = await _packRepository.GetNamesByModelIdAsync(model.Id, cancellationToken);
        await _searchDocumentRepository.SetPacksForAssetAsync(
            ExtractionAssetTypes.Model,
            model.Id,
            names.Where(n => !string.Equals(n, pack.Name, StringComparison.OrdinalIgnoreCase)),
            cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record RemoveModelFromPackCommand(int PackId, int ModelId) : ICommand;
