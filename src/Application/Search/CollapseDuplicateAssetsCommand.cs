using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Models;
using SharedKernel;

namespace Application.Search;

/// <summary>
/// Collapses a group of same-geometry assets down to one, recycling the copies.
///
/// <para>
/// Recycled, not merged. Folding a duplicate into the survivor as an extra <i>version</i>
/// reads better on paper and is the wrong operation: it moves files between aggregates,
/// changes which version is active, and silently re-points every scene that referenced the
/// copy. Recycling leaves each asset intact and reversible - <c>restore_asset</c> brings one
/// back untouched - which is the right way to fail when the caller collapsed the wrong copy.
/// </para>
///
/// <para>
/// The survivor is <b>never</b> chosen implicitly from a name or a format. The caller names
/// it, because the two copies of a POLYGON City prop are an FBX and an OBJ and only the user
/// knows which one their pipeline reads.
/// </para>
/// </summary>
/// <param name="SurvivorModelId">The copy to keep.</param>
/// <param name="RedundantModelIds">The copies to recycle. Must share the survivor's geometry.</param>
/// <param name="DryRun">Report what would happen and change nothing.</param>
public record CollapseDuplicateAssetsCommand(
    int SurvivorModelId,
    IReadOnlyList<int> RedundantModelIds,
    bool DryRun = false) : ICommand<CollapseDuplicateAssetsResponse>;

public record CollapseDuplicateAssetsResponse(
    int SurvivorModelId,
    IReadOnlyList<int> Recycled,
    bool DryRun);

internal sealed class CollapseDuplicateAssetsCommandHandler
    : ICommandHandler<CollapseDuplicateAssetsCommand, CollapseDuplicateAssetsResponse>
{
    private readonly IAssetSearchDocumentRepository _searchDocuments;
    private readonly ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> _softDelete;

    public CollapseDuplicateAssetsCommandHandler(
        IAssetSearchDocumentRepository searchDocuments,
        ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse> softDelete)
    {
        _searchDocuments = searchDocuments;
        _softDelete = softDelete;
    }

    public async Task<Result<CollapseDuplicateAssetsResponse>> Handle(
        CollapseDuplicateAssetsCommand command,
        CancellationToken cancellationToken)
    {
        var redundant = (command.RedundantModelIds ?? Array.Empty<int>())
            .Where(id => id != command.SurvivorModelId)
            .Distinct()
            .ToList();

        if (redundant.Count == 0)
        {
            return Result.Failure<CollapseDuplicateAssetsResponse>(new Error(
                "NothingToCollapse",
                "Name at least one redundant model id that is not the survivor."));
        }

        var survivorDoc = await _searchDocuments.GetCurrentAssetDocumentAsync(
            ExtractionAssetTypes.Model, command.SurvivorModelId, cancellationToken);
        if (survivorDoc?.GeometryKey is not { } key)
        {
            return Result.Failure<CollapseDuplicateAssetsResponse>(new Error(
                "SurvivorNotFingerprinted",
                $"Model {command.SurvivorModelId} has no geometry fingerprint, so nothing can be " +
                "shown to be a copy of it. Re-derive it first (trigger_rederive), then retry."));
        }

        // Verified rather than trusted. The caller passes ids from a listing that may be
        // minutes old, and this recycles assets - "collapse these because they are the same"
        // has to be checked against what the projection says now, not against a stale page.
        foreach (var id in redundant)
        {
            var doc = await _searchDocuments.GetCurrentAssetDocumentAsync(
                ExtractionAssetTypes.Model, id, cancellationToken);
            if (doc?.GeometryKey is null || !string.Equals(doc.GeometryKey, key, StringComparison.Ordinal))
            {
                return Result.Failure<CollapseDuplicateAssetsResponse>(new Error(
                    "NotADuplicate",
                    $"Model {id} does not carry the same geometry as {command.SurvivorModelId}, " +
                    "so recycling it would delete a different asset. Nothing was changed."));
            }
        }

        if (command.DryRun)
        {
            return Result.Success(new CollapseDuplicateAssetsResponse(
                command.SurvivorModelId, redundant, true));
        }

        foreach (var id in redundant)
        {
            var result = await _softDelete.Handle(new SoftDeleteModelCommand(id), cancellationToken);
            if (result.IsFailure)
            {
                return Result.Failure<CollapseDuplicateAssetsResponse>(result.Error);
            }
        }

        return Result.Success(new CollapseDuplicateAssetsResponse(
            command.SurvivorModelId, redundant, false));
    }
}
