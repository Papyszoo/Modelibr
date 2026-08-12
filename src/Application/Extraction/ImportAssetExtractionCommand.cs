using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Extraction;

/// <summary>
/// Generic worker-authenticated persistence of a raw extraction for a non-mesh
/// asset family (TextureSet, Sound, Script, Sprite, EnvironmentMap). Upserts the
/// verbatim payload into the substrate keyed by (AssetType, AssetId, VersionId,
/// FileSha256), so re-extraction is idempotent. Models are excluded - they use the
/// bespoke <see cref="Models.ImportModelSceneGraphCommand"/>, which additionally
/// refreshes the flat technical-metadata projection and per-part rows.
/// </summary>
public record ImportAssetExtractionCommand(
    string AssetType,
    int AssetId,
    int? VersionId,
    string FileSha256,
    string RawPayload,
    int ExtractorVersion,
    int SchemaVersion,
    ExtractionOutcome? Outcome,
    IReadOnlyList<string> Warnings) : ICommand;

internal sealed class ImportAssetExtractionCommandHandler : ICommandHandler<ImportAssetExtractionCommand>
{
    /// <summary>Non-mesh families this generic endpoint accepts. Model routes through the scene-graph command.</summary>
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.Ordinal)
    {
        ExtractionAssetTypes.TextureSet,
        ExtractionAssetTypes.Sound,
        ExtractionAssetTypes.Script,
        ExtractionAssetTypes.Sprite,
        ExtractionAssetTypes.EnvironmentMap,
    };

    private readonly IAssetExtractionRepository _assetExtractionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public ImportAssetExtractionCommandHandler(
        IAssetExtractionRepository assetExtractionRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _assetExtractionRepository = assetExtractionRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(ImportAssetExtractionCommand command, CancellationToken cancellationToken)
    {
        var assetType = command.AssetType?.Trim() ?? string.Empty;

        if (!AllowedTypes.Contains(assetType))
        {
            return Result.Failure(new Error(
                "UnsupportedAssetType",
                $"'{command.AssetType}' is not a non-mesh extraction type. Models use the scene-graph endpoint."));
        }

        if (command.AssetId <= 0)
        {
            return Result.Failure(new Error("InvalidAssetId", "A positive asset id is required."));
        }

        var fileSha256 = command.FileSha256?.Trim() ?? string.Empty;
        if (fileSha256.Length != 64)
        {
            return Result.Failure(new Error("InvalidFileHash", "A 64-character file SHA-256 is required."));
        }

        var now = _dateTimeProvider.UtcNow;
        var warnings = command.Warnings ?? Array.Empty<string>();
        var outcome = command.Outcome
            ?? (warnings.Count > 0 ? ExtractionOutcome.Partial : ExtractionOutcome.Complete);

        // Non-versioned families (materials, sounds, scripts, sprites, env maps) carry no
        // GeometryHashVersion; the NULLS-NOT-DISTINCT unique index treats VersionId=null as
        // a single slot so re-extraction upserts in place.
        var existing = await _assetExtractionRepository.GetByKeyAsync(
            assetType, command.AssetId, command.VersionId, fileSha256, cancellationToken);

        if (existing is null)
        {
            var extraction = AssetExtraction.Create(
                assetType, command.AssetId, command.VersionId, fileSha256,
                command.RawPayload, command.ExtractorVersion, command.SchemaVersion, now,
                geometryHashVersion: null, outcome: outcome, warnings: warnings);
            await _assetExtractionRepository.AddAsync(extraction, cancellationToken);
        }
        else
        {
            existing.UpdatePayload(
                command.RawPayload, command.ExtractorVersion, command.SchemaVersion, now,
                geometryHashVersion: null, outcome: outcome, warnings: warnings);
            await _assetExtractionRepository.UpdateAsync(existing, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
