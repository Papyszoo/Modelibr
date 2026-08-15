using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using SharedKernel;

namespace Application.Packs;

internal class DeletePackCommandHandler : ICommandHandler<DeletePackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeletePackCommandHandler(
        IPackRepository packRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(DeletePackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.Id, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.Id} was not found."));
        }

        // Drop the pack's name from every member's projection before the pack is gone.
        // Deleting the pack removes the join rows but leaves the denormalised name behind,
        // so search would keep matching a pack that no longer exists.
        //
        // Done in bulk rather than per model: this touches the entire membership, and a
        // content pack runs to four figures.
        var modelIds = pack.GetModels().Select(m => m.Id).ToList();
        if (modelIds.Count > 0)
        {
            var namesByModelId = await _packRepository.GetNamesByModelIdsAsync(modelIds, cancellationToken);
            var remaining = modelIds.ToDictionary(
                id => id,
                id => (IReadOnlyList<string>)(namesByModelId.TryGetValue(id, out var names)
                        ? names.Where(n => !string.Equals(n, pack.Name, StringComparison.Ordinal)).ToList()
                        : []));

            await _searchDocumentRepository.SetPacksForAssetsAsync(
                ExtractionAssetTypes.Model,
                remaining,
                cancellationToken);
        }

        await _packRepository.DeleteAsync(pack, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record DeletePackCommand(int Id) : ICommand;
