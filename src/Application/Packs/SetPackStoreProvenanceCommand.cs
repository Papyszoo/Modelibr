using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

/// <summary>
/// Stamps a pack with the store it was imported from (v0.5 prompt 05). Separate from
/// <see cref="CreatePackCommand"/> so pack creation stays untouched; the importer calls this
/// right after creating the pack. Re-stamping an already-stamped pack refreshes the manifest
/// version / timestamp.
/// </summary>
public record SetPackStoreProvenanceCommand(
    int PackId,
    string StoreUrl,
    string StoreAssetId,
    int ManifestVersion) : ICommand;

internal sealed class SetPackStoreProvenanceCommandHandler : ICommandHandler<SetPackStoreProvenanceCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SetPackStoreProvenanceCommandHandler(
        IPackRepository packRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(SetPackStoreProvenanceCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        try
        {
            pack.RecordStoreImport(command.StoreUrl, command.StoreAssetId, command.ManifestVersion, _dateTimeProvider.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(new Error("InvalidStoreProvenance", ex.Message));
        }

        await _packRepository.UpdateAsync(pack, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
