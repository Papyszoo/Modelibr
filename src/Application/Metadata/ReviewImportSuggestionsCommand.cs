using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Models;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Metadata;

/// <summary>
/// Settles the import automation's guesses in bulk: keep them, or take them back.
///
/// <para>
/// One action over many assets on purpose. The automation classifies a whole import at once,
/// so the review has to be answerable at the same scale - confirming 700 assets one card at
/// a time is not a review, it is the work the automation was supposed to remove.
/// </para>
///
/// <para>
/// <b>Reject undoes what was applied, not what the user has since done.</b> Only the tags
/// the automation added are removed, and the category only when it is still the one the
/// automation chose. An asset a person re-categorised after the fact keeps their decision.
/// </para>
/// </summary>
/// <param name="ModelIds">Which assets to settle. Empty means every asset waiting.</param>
/// <param name="Accept">True to keep what was applied; false to take it back.</param>
public record ReviewImportSuggestionsCommand(
    IReadOnlyList<int>? ModelIds,
    bool Accept) : ICommand<ReviewImportSuggestionsResponse>;

/// <param name="Reviewed">How many assets left the queue.</param>
/// <param name="CategoriesCleared">How many category assignments were taken back.</param>
/// <param name="TagsRemoved">How many tag assignments were taken back.</param>
public record ReviewImportSuggestionsResponse(
    int Reviewed,
    int CategoriesCleared,
    int TagsRemoved,
    int Remaining);

internal sealed class ReviewImportSuggestionsCommandHandler
    : ICommandHandler<ReviewImportSuggestionsCommand, ReviewImportSuggestionsResponse>
{
    /// <summary>
    /// How many assets one "settle everything" call touches. A whole-library reject has to
    /// load, mutate and re-project every asset it undoes, and an unbounded version of that
    /// is a request that never returns on a 1,700-model import. The caller repeats until
    /// <c>Remaining</c> is zero.
    /// </summary>
    private const int MaxPerCall = 500;

    private readonly IAssetMetadataRepository _metadata;
    private readonly IModelRepository _models;
    private readonly IAssetSearchDocumentRepository _searchDocuments;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public ReviewImportSuggestionsCommandHandler(
        IAssetMetadataRepository metadata,
        IModelRepository models,
        IAssetSearchDocumentRepository searchDocuments,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _metadata = metadata;
        _models = models;
        _searchDocuments = searchDocuments;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ReviewImportSuggestionsResponse>> Handle(
        ReviewImportSuggestionsCommand command,
        CancellationToken cancellationToken)
    {
        var now = _dateTimeProvider.UtcNow;

        IReadOnlyList<AssetMetadata> rows;
        if (command.ModelIds is { Count: > 0 })
        {
            rows = await _metadata.GetPendingAutoReviewByIdsAsync(
                ExtractionAssetTypes.Model, command.ModelIds.Distinct().ToList(), cancellationToken);
        }
        else
        {
            var (page, _) = await _metadata.GetPendingAutoReviewAsync(
                ExtractionAssetTypes.Model, 1, MaxPerCall, cancellationToken);
            // Re-read tracked: the paged read is AsNoTracking, and these rows are about to
            // be written back.
            rows = await _metadata.GetPendingAutoReviewByIdsAsync(
                ExtractionAssetTypes.Model, page.Select(r => r.AssetId).ToList(), cancellationToken);
        }

        var categoriesCleared = 0;
        var tagsRemoved = 0;

        foreach (var row in rows)
        {
            if (!command.Accept)
            {
                var (clearedCategory, removedTags) = await RevertAsync(row, now, cancellationToken);
                if (clearedCategory) categoriesCleared++;
                tagsRemoved += removedTags;
            }

            row.MarkAutoReviewed(now);
            await _metadata.UpdateAsync(row, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var (_, remaining) = await _metadata.GetPendingAutoReviewAsync(
            ExtractionAssetTypes.Model, 1, 1, cancellationToken);

        return Result.Success(new ReviewImportSuggestionsResponse(
            rows.Count, categoriesCleared, tagsRemoved, remaining));
    }

    private async Task<(bool ClearedCategory, int RemovedTags)> RevertAsync(
        AssetMetadata row,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var model = await _models.GetByIdAsync(row.AssetId, cancellationToken);
        if (model is null)
        {
            return (false, 0);
        }

        // Only when the asset still carries exactly what the automation put there. Anything
        // else means a person has been here since, and their decision outranks this undo.
        var clearCategory = row.AutoCategoryId is not null
            && model.ModelCategoryId == row.AutoCategoryId;

        var autoTagNames = new HashSet<string>(
            row.AutoTags.Select(ModelTag.NormalizeName), StringComparer.Ordinal);
        var keptTags = model.Tags
            .Where(t => !autoTagNames.Contains(t.NormalizedName))
            .ToList();
        var removed = model.Tags.Count - keptTags.Count;

        if (!clearCategory && removed == 0)
        {
            return (false, 0);
        }

        if (removed > 0)
        {
            model.SetMetadata(keptTags, model.Description, now);
        }
        if (clearCategory)
        {
            model.AssignCategory(null, now);
        }
        await _models.UpdateAsync(model, cancellationToken);

        // The projection is denormalised, so an undo that only touched the aggregate would
        // leave search still filtering on a category the asset no longer has.
        if (clearCategory)
        {
            await _searchDocuments.SetCategoryForAssetAsync(
                ExtractionAssetTypes.Model, model.Id, null, null, cancellationToken);
        }
        if (removed > 0)
        {
            await _searchDocuments.SetMetadataForAssetAsync(
                ExtractionAssetTypes.Model, model.Id,
                ModelDtoMappings.ToTagNames(model.Tags), model.Description, cancellationToken);
        }

        return (clearCategory, removed);
    }
}
