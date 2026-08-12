using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class CreatePackCommandHandler : ICommandHandler<CreatePackCommand, CreatePackResponse>
{
    private readonly IPackRepository _packRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreatePackCommandHandler(
        IPackRepository packRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CreatePackResponse>> Handle(CreatePackCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Check if a pack with the same name already exists
            var existingPack = await _packRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingPack != null)
            {
                return Result.Failure<CreatePackResponse>(
                    new Error("PackAlreadyExists", $"A pack with the name '{command.Name}' already exists."));
            }

            // Create new pack using domain factory method
            var pack = Pack.Create(command.Name, command.Description, command.LicenseType, command.Url, _dateTimeProvider.UtcNow);

            // Store provenance is stamped BEFORE the save, not by a follow-up command: the pack
            // row and its (StoreImportUrl, StoreImportAssetId) idempotency key must become
            // visible in the same transaction. Two commits left a window where a crash — or a
            // concurrent import of the same asset — produced a second, unstamped pack.
            if (command.StoreProvenance is { } provenance)
            {
                pack.RecordStoreImport(
                    provenance.StoreUrl, provenance.StoreAssetId, provenance.ManifestVersion, _dateTimeProvider.UtcNow);
            }

            var savedPack = await _packRepository.AddAsync(pack, cancellationToken);

            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(new CreatePackResponse(savedPack.Id, savedPack.Name, savedPack.Description, savedPack.LicenseType, savedPack.Url));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreatePackResponse>(
                new Error("PackCreationFailed", ex.Message));
        }
    }
}

public record CreatePackCommand(
    string Name,
    string? Description,
    string? LicenseType,
    string? Url,
    PackStoreProvenance? StoreProvenance = null) : ICommand<CreatePackResponse>;

/// <summary>
/// Store-import stamp applied at pack creation time. Optional — only the store importer
/// supplies it; every other caller creates an unstamped pack.
/// </summary>
public record PackStoreProvenance(string StoreUrl, string StoreAssetId, int ManifestVersion);

public record CreatePackResponse(int Id, string Name, string? Description, string? LicenseType, string? Url);
