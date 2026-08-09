using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class UpdateTechnicalMetadataCommandHandler : ICommandHandler<UpdateTechnicalMetadataCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IAssetExtractionRepository _assetExtractionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateTechnicalMetadataCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IAssetExtractionRepository assetExtractionRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelVersionRepository = modelVersionRepository;
        _assetExtractionRepository = assetExtractionRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(UpdateTechnicalMetadataCommand command, CancellationToken cancellationToken)
    {
        var version = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
        if (version == null)
        {
            return Result.Failure(new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;

        version.UpdateTechnicalMetadata(
            command.MaterialNames,
            command.TriangleCount,
            command.VertexCount,
            command.MeshCount,
            command.MaterialCount,
            command.BoundingBoxX,
            command.BoundingBoxY,
            command.BoundingBoxZ,
            command.AnimationCount,
            command.AnimationNames,
            command.BoneCount,
            now);

        await _modelVersionRepository.UpdateAsync(version, cancellationToken);

        // Re-point: the flat columns above stay the derived projection the UI reads;
        // the same extractor output is also persisted verbatim into the raw
        // extraction layer, keyed by the version's primary model file so it can be
        // invalidated/re-extracted independently of thumbnail rendering. Best-effort:
        // if we can't identify a file hash, the flat write still stands (no regression).
        await UpsertRawExtractionAsync(version, command, now, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    private async Task UpsertRawExtractionAsync(
        Domain.Models.ModelVersion version,
        UpdateTechnicalMetadataCommand command,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var fileHash = version.GetFiles()
            .OrderBy(f => f.FileType.Category == Domain.ValueObjects.FileTypeCategory.Model3D ? 0
                        : f.FileType.Category == Domain.ValueObjects.FileTypeCategory.Project ? 1
                        : 2)
            .Select(f => f.Sha256Hash)
            .FirstOrDefault(h => !string.IsNullOrWhiteSpace(h) && h.Length == 64);

        if (fileHash is null)
        {
            return;
        }

        var payload = BuildRawPayload(command);

        var existing = await _assetExtractionRepository.GetByKeyAsync(
            ExtractionAssetTypes.Model, version.ModelId, version.Id, fileHash, cancellationToken);

        if (existing is null)
        {
            var extraction = Domain.Models.AssetExtraction.Create(
                ExtractionAssetTypes.Model,
                version.ModelId,
                version.Id,
                fileHash,
                payload,
                ExtractionVersions.ModelGeometryExtractor,
                ExtractionVersions.Schema,
                now);
            await _assetExtractionRepository.AddAsync(extraction, cancellationToken);
        }
        else
        {
            existing.UpdatePayload(
                payload,
                ExtractionVersions.ModelGeometryExtractor,
                ExtractionVersions.Schema,
                now);
            await _assetExtractionRepository.UpdateAsync(existing, cancellationToken);
        }
    }

    // Reproducible payload: collections sorted, floats rounded, no timestamps/paths.
    private static string BuildRawPayload(UpdateTechnicalMetadataCommand command)
    {
        var payload = new
        {
            materialNames = SortedDistinct(command.MaterialNames),
            triangleCount = command.TriangleCount,
            vertexCount = command.VertexCount,
            meshCount = command.MeshCount,
            materialCount = command.MaterialCount,
            boundingBox = new
            {
                x = Round(command.BoundingBoxX),
                y = Round(command.BoundingBoxY),
                z = Round(command.BoundingBoxZ),
            },
            animationCount = command.AnimationCount,
            animationNames = SortedDistinct(command.AnimationNames),
            boneCount = command.BoneCount,
        };

        return JsonSerializer.Serialize(payload);
    }

    private static IReadOnlyList<string> SortedDistinct(IEnumerable<string>? values) =>
        (values ?? Enumerable.Empty<string>())
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(v => v, StringComparer.Ordinal)
            .ToList();

    private static double? Round(double? value) =>
        value.HasValue ? Math.Round(value.Value, 6, MidpointRounding.AwayFromZero) : null;
}

public record UpdateTechnicalMetadataCommand(
    int ModelVersionId,
    List<string> MaterialNames,
    int? TriangleCount,
    int? VertexCount,
    int? MeshCount,
    int? MaterialCount,
    double? BoundingBoxX = null,
    double? BoundingBoxY = null,
    double? BoundingBoxZ = null,
    int? AnimationCount = null,
    List<string>? AnimationNames = null,
    int? BoneCount = null) : ICommand;
