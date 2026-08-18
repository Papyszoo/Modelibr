using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Extraction.Derivation;
using Application.Search;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Persists a full scene-graph extraction for a model version: replaces the
/// per-part rows, refreshes the flat technical-metadata projection the UI reads,
/// and upserts the verbatim raw payload into the extraction substrate. Called by
/// the worker after it walks the loaded model (three.js path; a bpy pass sends the
/// same shape with the native-only fields populated).
/// </summary>
public record ImportModelSceneGraphCommand(
    int ModelVersionId,
    string FileSha256,
    int ExtractorVersion,
    int? GeometryHashVersion,
    int SchemaVersion,
    string RawPayload,
    SceneGraphRollupsDto Rollups,
    IReadOnlyList<SceneGraphPartDto> Parts,
    IReadOnlyList<string> Warnings) : ICommand;

public record SceneGraphPartDto(
    string PartPath,
    string Name,
    string? ParentPath,
    int Depth,
    string ObjectType,
    int? TriangleCount,
    int? VertexCount,
    string? GeometryHash,
    bool? HasUvs,
    JsonElement? Detail);

public record SceneGraphRollupsDto(
    int? MeshCount,
    int? TotalTriangles,
    int? TotalVertices,
    int? MaterialCount,
    List<string>? MaterialNames,
    int? BoneCount,
    SceneGraphWorldBoundsDto? WorldBounds,
    int? AnimationCount,
    List<string>? AnimationNames);

/// <summary>
/// The asset's world bounding box. <paramref name="Min"/> and <paramref name="Max"/> are
/// what say where the origin sits inside it; sending only the dimensions is why placement
/// had to assume a centred origin.
/// </summary>
public record SceneGraphWorldBoundsDto(
    List<double>? Dimensions,
    List<double>? Min = null,
    List<double>? Max = null);

internal sealed class ImportModelSceneGraphCommandHandler : ICommandHandler<ImportModelSceneGraphCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IAssetPartRepository _assetPartRepository;
    private readonly IAssetExtractionRepository _assetExtractionRepository;
    private readonly IAssetDerivationRepository _assetDerivationRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly DerivationOptions _derivationOptions;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public ImportModelSceneGraphCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IAssetPartRepository assetPartRepository,
        IAssetExtractionRepository assetExtractionRepository,
        IAssetDerivationRepository assetDerivationRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        DerivationOptions derivationOptions,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelVersionRepository = modelVersionRepository;
        _assetPartRepository = assetPartRepository;
        _assetExtractionRepository = assetExtractionRepository;
        _assetDerivationRepository = assetDerivationRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _derivationOptions = derivationOptions;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(ImportModelSceneGraphCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.FileSha256) || command.FileSha256.Length != 64)
        {
            return Result.Failure(new Error("InvalidFileHash", "A 64-character file SHA-256 is required."));
        }

        var version = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
        if (version == null)
        {
            return Result.Failure(new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;
        var rollups = command.Rollups;
        var dims = rollups.WorldBounds?.Dimensions;

        // 1. Refresh the flat projection the UI/filters read.
        version.UpdateTechnicalMetadata(
            rollups.MaterialNames,
            rollups.TotalTriangles,
            rollups.TotalVertices,
            rollups.MeshCount,
            rollups.MaterialCount,
            dims is { Count: >= 1 } ? dims[0] : null,
            dims is { Count: >= 2 } ? dims[1] : null,
            dims is { Count: >= 3 } ? dims[2] : null,
            rollups.AnimationCount,
            rollups.AnimationNames,
            rollups.BoneCount,
            now);
        await _modelVersionRepository.UpdateAsync(version, cancellationToken);

        // 2. Replace the per-part rows (re-extraction is a full replace).
        await _assetPartRepository.RemoveForAssetAsync(
            ExtractionAssetTypes.Model, version.ModelId, version.Id, cancellationToken);

        foreach (var partDto in command.Parts)
        {
            var part = AssetPart.Create(
                ExtractionAssetTypes.Model,
                version.ModelId,
                version.Id,
                partDto.PartPath,
                partDto.Name,
                partDto.Depth,
                partDto.ObjectType,
                now,
                parentPath: partDto.ParentPath,
                triangleCount: partDto.TriangleCount,
                vertexCount: partDto.VertexCount,
                geometryHash: partDto.GeometryHash,
                geometryHashVersion: partDto.GeometryHash is null ? null : command.GeometryHashVersion,
                hasUvs: partDto.HasUvs,
                detail: partDto.Detail?.GetRawText());
            await _assetPartRepository.AddAsync(part, cancellationToken);
        }

        // 3. Upsert the verbatim raw payload into the extraction substrate.
        var outcome = command.Warnings.Count > 0 ? ExtractionOutcome.Partial : ExtractionOutcome.Complete;
        var existing = await _assetExtractionRepository.GetByKeyAsync(
            ExtractionAssetTypes.Model, version.ModelId, version.Id, command.FileSha256, cancellationToken);

        if (existing is null)
        {
            var extraction = AssetExtraction.Create(
                ExtractionAssetTypes.Model, version.ModelId, version.Id, command.FileSha256,
                command.RawPayload, command.ExtractorVersion, command.SchemaVersion, now,
                geometryHashVersion: command.GeometryHashVersion, outcome: outcome, warnings: command.Warnings);
            await _assetExtractionRepository.AddAsync(extraction, cancellationToken);
        }
        else
        {
            existing.UpdatePayload(
                command.RawPayload, command.ExtractorVersion, command.SchemaVersion, now,
                geometryHashVersion: command.GeometryHashVersion, outcome: outcome, warnings: command.Warnings);
            await _assetExtractionRepository.UpdateAsync(existing, cancellationToken);
        }

        // 4. Recompute the derived-signal layer from the raw parts + rollups. Pure,
        //    re-runnable, and never touches the raw rows above; upserted in the same
        //    unit of work so extraction + derivation commit atomically.
        var derivationInput = SceneGraphDerivationMapper.ToDerivationInput(
            version.Model?.Name, rollups, command.Parts);
        var derived = AssetDerivationEngine.Derive(derivationInput, _derivationOptions);
        var derivedPayload = JsonSerializer.Serialize(derived);

        var existingDerivation = await _assetDerivationRepository.GetByKeyAsync(
            ExtractionAssetTypes.Model, version.ModelId, version.Id, cancellationToken);
        if (existingDerivation is null)
        {
            var derivation = AssetDerivation.Create(
                ExtractionAssetTypes.Model, version.ModelId, version.Id,
                derived.DeriveVersion, derivedPayload, now);
            await _assetDerivationRepository.AddAsync(derivation, cancellationToken);
        }
        else
        {
            existingDerivation.UpdatePayload(derived.DeriveVersion, derivedPayload, now);
            await _assetDerivationRepository.UpdateAsync(existingDerivation, cancellationToken);
        }

        // 5. Rebuild the search projection for this version (asset + non-hidden parts).
        //
        //    "Current" is the model's ACTIVE version, not whichever extraction finished
        //    last. Marking this version current unconditionally meant a delayed job for
        //    an old version, an upload of a non-active version, or a re-derive could all
        //    silently swap what search returns for the asset.
        var isCurrentVersion = version.Model is null
            // No model loaded (defensive): fall back to owning the flag rather than
            // leaving the asset with no searchable current version at all.
            ? true
            : version.Model.ActiveVersionId == version.Id;

        await _searchDocumentRepository.RemoveForAssetAsync(
            ExtractionAssetTypes.Model, version.ModelId, version.Id, cancellationToken);

        var searchDocs = SearchDocumentBuilder.BuildForModel(
            version.ModelId, version.Id, isCurrentVersion,
            version.Model?.Name, derived, rollups, command.Parts, now,
            categoryId: version.Model?.ModelCategoryId,
            categoryName: version.Model?.ModelCategory?.Name,
            // A recycled model must stay out of search after a re-extraction too.
            isActive: version.Model?.IsDeleted != true && !version.IsDeleted,
            // Pack membership is author-written grouping. It is also patched in place by
            // the pack commands, so this only seeds it - a re-derive must not blank out
            // packs the asset joined since the last extraction.
            packNames: version.Model?.Packs?.Select(p => p.Name),
            // The version's own bounding box, not the rollups': it is written from the
            // pre-normalization size, so it is real metres for extractions on both sides of
            // `7f0c7c77`. Indexing the rollups made all 1762 models report a longest axis of
            // exactly 2 and left the size filters matching nothing.
            assetDimensions: BoundingBoxOf(version),
            // Carried through for the same reason as packs: tags and description are edited
            // long after import, and a re-derive that rebuilt documents without them would
            // silently un-find every asset the user had taken the trouble to label.
            authoredTags: version.Model?.Tags?.Select(t => t.Name),
            description: version.Model?.Description);
        foreach (var doc in searchDocs)
        {
            await _searchDocumentRepository.AddAsync(doc, cancellationToken);
        }

        // Only the active version may clear the flag on its siblings.
        if (isCurrentVersion)
        {
            var otherVersionDocs = await _searchDocumentRepository.GetForOtherVersionsAsync(
                ExtractionAssetTypes.Model, version.ModelId, version.Id, cancellationToken);
            foreach (var doc in otherVersionDocs)
            {
                doc.SetCurrentVersion(false);
                await _searchDocumentRepository.UpdateAsync(doc, cancellationToken);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }

    /// <summary>
    /// The version's flat bounding box as a dimension triple, or null when it was never
    /// measured. This runs after <c>UpdateTechnicalMetadata</c> above, so a fresh extraction
    /// reads back the size it just wrote and an older row keeps the real one it already had.
    /// </summary>
    private static IReadOnlyList<double>? BoundingBoxOf(ModelVersion version) =>
        version.BoundingBoxX is { } x && version.BoundingBoxY is { } y && version.BoundingBoxZ is { } z
            ? new[] { x, y, z }
            : null;
}
