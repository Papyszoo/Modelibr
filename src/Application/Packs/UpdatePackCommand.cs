using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class UpdatePackCommandHandler : ICommandHandler<UpdatePackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdatePackCommandHandler(
        IPackRepository packRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(UpdatePackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var pack = await _packRepository.GetByIdAsync(command.Id, cancellationToken);
            if (pack == null)
            {
                return Result.Failure(
                    new Error("PackNotFound", $"Pack with ID {command.Id} was not found."));
            }

            // Check if another pack with the same name exists (excluding current pack)
            var existingPack = await _packRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingPack != null && existingPack.Id != command.Id)
            {
                return Result.Failure(
                    new Error("PackAlreadyExists", $"A pack with the name '{command.Name}' already exists."));
            }

            var previousName = pack.Name;

            pack.Update(command.Name, command.Description, command.LicenseType, command.Url, _dateTimeProvider.UtcNow);

            await _packRepository.UpdateAsync(pack, cancellationToken);

            // A rename invalidates the denormalised pack name on every member's search
            // document. Without this, searching the new name finds nothing and searching
            // the old one still finds everything.
            //
            // Done in bulk rather than per model: a rename touches the entire membership,
            // and a content pack runs to four figures.
            var modelIds = pack.GetModels().Select(m => m.Id).ToList();
            if (!string.Equals(previousName, pack.Name, StringComparison.Ordinal) && modelIds.Count > 0)
            {
                var namesByModelId = await _packRepository.GetNamesByModelIdsAsync(modelIds, cancellationToken);
                var renamed = modelIds.ToDictionary(
                    id => id,
                    id => (IReadOnlyList<string>)(namesByModelId.TryGetValue(id, out var names)
                            ? names
                                .Where(n => !string.Equals(n, previousName, StringComparison.Ordinal))
                                .Append(pack.Name)
                                .ToList()
                            : [pack.Name]));

                await _searchDocumentRepository.SetPacksForAssetsAsync(
                    ExtractionAssetTypes.Model,
                    renamed,
                    cancellationToken);
            }

            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("PackUpdateFailed", ex.Message));
        }
    }
}

public record UpdatePackCommand(int Id, string Name, string? Description, string? LicenseType, string? Url) : ICommand;
