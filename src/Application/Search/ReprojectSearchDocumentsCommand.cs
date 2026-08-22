using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Extraction.Derivation;
using Application.Models;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Search;

/// <summary>
/// Rebuilds the search projection from data already in the database - no file is opened,
/// no extractor runs, no derivation is recomputed.
///
/// <para>
/// The projection is denormalised, and the vocabulary that widens an asset's tokens
/// (<see cref="SearchVocabulary"/>) is applied at <b>index</b> time so the query side stays
/// a plain literal match. Both are deliberate, and together they have one consequence
/// nothing addressed: teaching the library that a rug is a carpet changes no stored row,
/// so the new word finds nothing until every asset is written again. The only route to
/// that was re-extraction - re-downloading and re-parsing every file to arrive at parts and
/// rollups already sitting in two tables - which on a real library is hours of work to
/// apply a one-line vocabulary change.
/// </para>
///
/// <para>
/// So this reads the three stored layers back instead: <see cref="AssetPart"/> rows for the
/// raw parts, <see cref="ModelVersion"/>'s technical metadata for the rollups, and
/// <see cref="AssetDerivation.Payload"/> for the derived signals - the exact inputs
/// <c>ImportModelSceneGraphCommand</c> hands the builder - and runs the projection step
/// alone.
/// </para>
///
/// <para>
/// <b>What it deliberately cannot fix.</b> A stale <i>derivation</i> (new tokens, a changed
/// prominence rule, a new quality flag) and a stale <i>extraction</i> (a new geometry
/// signal) both live upstream of the projection, and re-running the projection over them
/// faithfully reprojects the old answer. Those still need <c>trigger_rederive</c>. This
/// fixes what the projection itself decides: the vocabulary, the denormalised
/// tags/description/packs/category, and the shape of the documents.
/// </para>
/// </summary>
/// <param name="ModelId">One model, or null for every model that has a derived row.</param>
public record ReprojectSearchDocumentsCommand(int? ModelId = null)
    : ICommand<ReprojectSearchDocumentsResponse>;

/// <param name="Reprojected">Assets whose documents were rebuilt.</param>
/// <param name="DocumentsWritten">Rows written - one per asset plus one per indexable part.</param>
/// <param name="Skipped">
/// Assets passed over because a layer the projection needs was missing: no derived row, no
/// model version, or a payload that could not be read. Counted rather than failed - one
/// unreadable asset must not abandon a library-wide rebuild half-applied.
/// </param>
public record ReprojectSearchDocumentsResponse(
    int Reprojected,
    int DocumentsWritten,
    int Skipped,
    IReadOnlyList<string> Notes);

internal sealed class ReprojectSearchDocumentsCommandHandler
    : ICommandHandler<ReprojectSearchDocumentsCommand, ReprojectSearchDocumentsResponse>
{
    /// <summary>
    /// Assets per commit. The unit of work tracks everything it has written, so a
    /// library-wide rebuild committed once would hold every document of every asset in
    /// memory before the first row reaches the database.
    /// </summary>
    private const int CommitBatchSize = 50;

    /// <summary>Skip notes carried back. Enough to diagnose a pattern, not a second log.</summary>
    private const int MaxNotes = 20;

    private readonly IAssetDerivationRepository _derivationRepository;
    private readonly IAssetPartRepository _partRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IAssetMetadataRepository _assetMetadataRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public ReprojectSearchDocumentsCommandHandler(
        IAssetDerivationRepository derivationRepository,
        IAssetPartRepository partRepository,
        IModelVersionRepository modelVersionRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IAssetMetadataRepository assetMetadataRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _derivationRepository = derivationRepository;
        _partRepository = partRepository;
        _modelVersionRepository = modelVersionRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _assetMetadataRepository = assetMetadataRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ReprojectSearchDocumentsResponse>> Handle(
        ReprojectSearchDocumentsCommand command,
        CancellationToken cancellationToken)
    {
        if (command.ModelId is <= 0)
        {
            return Result.Failure<ReprojectSearchDocumentsResponse>(
                new Error("InvalidModelId", "A model id must be positive, or omitted to reproject every model."));
        }

        var targets = await ResolveTargetsAsync(command.ModelId, cancellationToken);
        if (command.ModelId is { } requested && targets.Count == 0)
        {
            return Result.Failure<ReprojectSearchDocumentsResponse>(
                new Error(
                    "NotDerived",
                    $"Model {requested} has no derived row, so there is nothing to reproject. " +
                    "Run trigger_rederive on it first."));
        }

        var now = _dateTimeProvider.UtcNow;
        var notes = new List<string>();
        var reprojected = 0;
        var written = 0;
        var skipped = 0;
        var sinceCommit = 0;

        foreach (var target in targets)
        {
            var outcome = await ReprojectOneAsync(target, now, cancellationToken);
            if (outcome.Note is { } note)
            {
                skipped++;
                if (notes.Count < MaxNotes)
                {
                    notes.Add(note);
                }
                continue;
            }

            reprojected++;
            written += outcome.DocumentsWritten;
            sinceCommit++;

            if (sinceCommit >= CommitBatchSize)
            {
                await _unitOfWork.SaveChangesAsync(cancellationToken);
                sinceCommit = 0;
            }
        }

        if (sinceCommit > 0)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        if (skipped > MaxNotes)
        {
            notes.Add($"... and {skipped - MaxNotes} more skipped.");
        }

        return Result.Success(
            new ReprojectSearchDocumentsResponse(reprojected, written, skipped, notes));
    }

    private async Task<IReadOnlyList<(int AssetId, int? VersionId)>> ResolveTargetsAsync(
        int? modelId,
        CancellationToken cancellationToken)
    {
        if (modelId is not { } id)
        {
            return await _derivationRepository.GetDerivedKeysAsync(
                ExtractionAssetTypes.Model, cancellationToken);
        }

        // One model reprojects the version search actually offers, which is the active one
        // and not necessarily the highest id - the same distinction get_asset had to make.
        var derivation = await _derivationRepository.GetForActiveVersionAsync(
            ExtractionAssetTypes.Model, id, cancellationToken);

        return derivation is null
            ? Array.Empty<(int, int?)>()
            : new[] { (derivation.AssetId, derivation.VersionId) };
    }

    private async Task<(int DocumentsWritten, string? Note)> ReprojectOneAsync(
        (int AssetId, int? VersionId) target,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var (assetId, versionId) = target;

        var derivation = await _derivationRepository.GetByKeyAsync(
            ExtractionAssetTypes.Model, assetId, versionId, cancellationToken);
        if (derivation is null)
        {
            return (0, $"Model {assetId}: no derived row.");
        }

        DerivedAsset? derived;
        try
        {
            derived = JsonSerializer.Deserialize<DerivedAsset>(derivation.Payload);
        }
        catch (JsonException ex)
        {
            return (0, $"Model {assetId}: derived payload could not be read ({ex.Message}).");
        }

        if (derived is null)
        {
            return (0, $"Model {assetId}: derived payload is empty.");
        }

        if (versionId is not { } modelVersionId)
        {
            return (0, $"Model {assetId}: derived row carries no version id.");
        }

        var version = await _modelVersionRepository.GetByIdAsync(modelVersionId, cancellationToken);
        if (version is null)
        {
            return (0, $"Model {assetId}: version {modelVersionId} no longer exists.");
        }

        var parts = await _partRepository.GetForAssetAsync(
            ExtractionAssetTypes.Model, assetId, modelVersionId, cancellationToken);

        // Every field the projection reads off the rollups is stored on the version, put
        // there by the same handler that fed the builder. WorldBounds is reconstructed from
        // the dimensions alone: its Min/Max say where the origin sits, which the derivation
        // already resolved into OriginInBounds, and the builder only ever reads Dimensions
        // - and then only as a fallback behind the version's own bounding box.
        var rollups = new SceneGraphRollupsDto(
            MeshCount: version.MeshCount,
            TotalTriangles: version.TriangleCount,
            TotalVertices: version.VertexCount,
            MaterialCount: version.MaterialCount,
            MaterialNames: version.MaterialNames,
            BoneCount: version.BoneCount,
            WorldBounds: new SceneGraphWorldBoundsDto(BoundingBoxOf(version)?.ToList()),
            AnimationCount: version.AnimationCount,
            AnimationNames: version.AnimationNames);

        var rawParts = parts.Select(ToPartDto).ToList();

        // "Current" follows the model's active version, exactly as the extraction path
        // decides it - a reprojection must never move which version search answers with.
        var isCurrentVersion = version.Model is null || version.Model.ActiveVersionId == version.Id;

        var schemaMetadata = await _assetMetadataRepository.GetAsync(
            ExtractionAssetTypes.Model, assetId, cancellationToken);

        await _searchDocumentRepository.RemoveForAssetAsync(
            ExtractionAssetTypes.Model, assetId, modelVersionId, cancellationToken);

        var docs = SearchDocumentBuilder.BuildForModel(
            assetId, modelVersionId, isCurrentVersion,
            version.Model?.Name, derived, rollups, rawParts, now,
            categoryId: version.Model?.ModelCategoryId,
            categoryName: version.Model?.ModelCategory?.Name,
            isActive: version.Model?.IsDeleted != true && !version.IsDeleted,
            packNames: version.Model?.Packs?.Select(p => p.Name),
            assetDimensions: BoundingBoxOf(version),
            authoredTags: version.Model?.Tags?.Select(t => t.Name),
            description: version.Model?.Description,
            // A re-derive rebuilds the projection wholesale, so the metadata-schema facets
            // have to be re-read and carried in - a style someone set would otherwise be
            // blanked from search by the next extraction (prompt 16-F).
            styles: schemaMetadata?.Styles,
            themes: schemaMetadata?.Themes,
            license: schemaMetadata?.License);

        foreach (var doc in docs)
        {
            await _searchDocumentRepository.AddAsync(doc, cancellationToken);
        }

        return (docs.Count, null);
    }

    /// <summary>
    /// An <see cref="AssetPart"/> row back into the shape the builder was written against.
    /// The import handler persists every field of the DTO verbatim, so this is a faithful
    /// round trip rather than a reconstruction - Detail is the one that needs reparsing,
    /// because it is stored as text and read as JSON.
    /// </summary>
    private static SceneGraphPartDto ToPartDto(AssetPart part) =>
        new(
            part.PartPath,
            part.Name,
            part.ParentPath,
            part.Depth,
            part.ObjectType,
            part.TriangleCount,
            part.VertexCount,
            part.GeometryHash,
            part.HasUvs,
            ParseDetail(part.Detail));

    private static JsonElement? ParseDetail(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail))
        {
            return null;
        }

        try
        {
            // Cloned off the document so the value outlives the JsonDocument's buffer -
            // without it every part's detail reads back as a disposed element.
            using var document = JsonDocument.Parse(detail);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            // A part whose detail is unreadable still has a path, triangles and UVs, which
            // is most of what the projection wants from it. Losing the whole part over its
            // detail blob would be a worse answer than losing the blob.
            return null;
        }
    }

    private static IReadOnlyList<double>? BoundingBoxOf(ModelVersion version) =>
        version.BoundingBoxX is { } x && version.BoundingBoxY is { } y && version.BoundingBoxZ is { } z
            ? new[] { x, y, z }
            : null;
}
