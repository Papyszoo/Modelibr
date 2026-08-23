using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Extraction.Derivation;
using Application.Metadata;
using Application.Search;
using Application.Settings;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Applies the classification an import already has all the inputs for: a category from what
/// the asset is called and what it sits next to, and tags from the folder it came out of.
///
/// <para>
/// <b>Suggest, never overwrite.</b> A category is assigned only when the asset has none; a
/// tag is added, never removed. Everything applied is recorded on the asset's
/// <see cref="AssetMetadata"/> row as machine-derived, which is what lets the review screen
/// show "N assets categorized automatically" and tell a guess apart from a decision.
/// </para>
///
/// <para>
/// <b>It runs once.</b> <see cref="AssetMetadata.AutoAppliedAt"/> is the marker. Its inputs -
/// the file name and the folder - cannot change after import, so re-running it would only
/// re-add tags a user had deliberately removed.
/// </para>
///
/// <para>
/// Deliberately at <b>import</b> time rather than at extraction, even though
/// <see cref="CategorySuggester"/> also runs during projection. Only the importing side ever
/// sees the folder and the sibling file names, and this way an asset is categorised the
/// moment it lands rather than whenever the queue reaches it.
/// </para>
/// </summary>
public record ApplyImportAutomationCommand(
    int ModelId,
    string? SourceFolder = null,
    IReadOnlyList<string>? SiblingFileNames = null) : ICommand<ImportAutomationResponse>;

/// <param name="Applied">False when nothing was inferred, or automation was off, or it had already run.</param>
/// <param name="Reason">Why nothing was applied, for the caller's log. Null on success.</param>
public record ImportAutomationResponse(
    int ModelId,
    bool Applied,
    string? Reason,
    int? CategoryId,
    string? CategoryName,
    IReadOnlyList<string> Tags);

internal sealed class ApplyImportAutomationCommandHandler
    : ICommandHandler<ApplyImportAutomationCommand, ImportAutomationResponse>
{
    /// <summary>
    /// The category names the concept labels are written as. Labels are singular and
    /// lowercase because they are index tokens; a category is a heading someone reads.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> CategoryNames =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["weapon"] = "Weapons",
            ["vehicle"] = "Vehicles",
            ["character"] = "Characters",
            ["animal"] = "Animals",
            ["furniture"] = "Furniture",
            ["food"] = "Food",
            ["building"] = "Buildings",
            ["nature"] = "Nature",
            ["environment"] = "Environment",
            ["prop"] = "Props",
        };

    private readonly IModelRepository _modelRepository;
    private readonly IModelCategoryRepository _categoryRepository;
    private readonly IModelTagRepository _tagRepository;
    private readonly IAssetMetadataRepository _metadataRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public ApplyImportAutomationCommandHandler(
        IModelRepository modelRepository,
        IModelCategoryRepository categoryRepository,
        IModelTagRepository tagRepository,
        IAssetMetadataRepository metadataRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelRepository = modelRepository;
        _categoryRepository = categoryRepository;
        _tagRepository = tagRepository;
        _metadataRepository = metadataRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ImportAutomationResponse>> Handle(
        ApplyImportAutomationCommand command,
        CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model is null)
        {
            return Result.Failure<ImportAutomationResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;
        var metadata = await _metadataRepository.GetAsync(
            ExtractionAssetTypes.Model, model.Id, cancellationToken);
        var isNewMetadataRow = metadata is null;
        metadata ??= AssetMetadata.Create(
            ExtractionAssetTypes.Model, model.Id, AssetMetadataSchema.Version, now);

        // The folder is provenance, not a guess: record it whether or not anything is
        // inferred from it, and whether or not automation is switched on. Only when we
        // actually have one - a re-import through a route that carries no path must not
        // blank the folder an earlier import captured.
        if (!string.IsNullOrWhiteSpace(command.SourceFolder))
        {
            metadata.SetSourceFolder(command.SourceFolder, now);
        }

        var response = await ClassifyAsync(model, metadata, command, now, cancellationToken);

        if (isNewMetadataRow)
        {
            await _metadataRepository.AddAsync(metadata, cancellationToken);
        }
        else
        {
            await _metadataRepository.UpdateAsync(metadata, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success(response);
    }

    private async Task<ImportAutomationResponse> ClassifyAsync(
        Model model,
        AssetMetadata metadata,
        ApplyImportAutomationCommand command,
        DateTime now,
        CancellationToken cancellationToken)
    {
        static ImportAutomationResponse Nothing(int modelId, string reason) =>
            new(modelId, false, reason, null, null, Array.Empty<string>());

        if (metadata.AutoAppliedAt is not null)
        {
            return Nothing(model.Id, "alreadyApplied");
        }

        var enabled = (await _settingRepository.GetByKeyAsync(
            SettingKeys.AutoAssignOnImport, cancellationToken))?.Value;
        if (string.Equals(enabled, "false", StringComparison.OrdinalIgnoreCase))
        {
            return Nothing(model.Id, "disabled");
        }

        // What the asset is called is the strongest signal; the folder and the naming
        // convention its neighbours follow are what fill in the assets whose own name says
        // nothing. `SM_Veh_Wheel_03` is only a vehicle part because of the last two.
        var nameTokens = SearchVocabulary.ExpandForIndex(NameTokenizer.Tokenize(model.Name));
        var folderTokens = ImportFolderSignal.Tokens(command.SourceFolder);
        var siblingTokens = ImportFolderSignal.SharedSiblingTokens(
            command.SiblingFileNames, model.Name);

        var label = CategorySuggester.SuggestBest(
            nameTokens.Concat(folderTokens).Concat(siblingTokens));

        // Tags come from the folder only. The shared sibling tokens classify well but tag
        // badly - the thing five files in a folder actually share is the naming convention's
        // prefix, and "sm" is not a tag anybody wants on 696 assets.
        var tagCandidates = ImportFolderSignal.TagCandidates(command.SourceFolder);

        int? assignedCategoryId = null;
        string? assignedCategoryName = null;

        // Never overwrite a category the asset already has - a store import arrives with
        // one, and a user who set one has said something this cannot improve on.
        if (label is not null && model.ModelCategoryId is null)
        {
            var category = await ResolveCategoryAsync(label, now, cancellationToken);
            if (category is not null)
            {
                model.AssignCategory(category.Id, now);
                assignedCategoryId = category.Id;
                assignedCategoryName = category.Name;
            }
        }

        var addedTags = await AddTagsAsync(model, tagCandidates, now, cancellationToken);

        if (assignedCategoryId is null && addedTags.Count == 0)
        {
            // Still stamped as run: the inputs will not change, so asking again is wasted
            // work, and an asset nothing could be inferred about does not belong in a
            // review queue.
            metadata.RecordAutoAssignment(Array.Empty<string>(), null, now);
            return Nothing(model.Id, "nothingInferred");
        }

        await _modelRepository.UpdateAsync(model, cancellationToken);

        // Search reads projection state only. Extraction has not run yet for a fresh
        // import, so these are usually no-ops - but a re-import of an already-indexed asset
        // would otherwise carry a category search cannot see.
        if (assignedCategoryId is not null)
        {
            await _searchDocumentRepository.SetCategoryForAssetAsync(
                ExtractionAssetTypes.Model, model.Id, assignedCategoryId, assignedCategoryName, cancellationToken);
        }
        if (addedTags.Count > 0)
        {
            await _searchDocumentRepository.SetMetadataForAssetAsync(
                ExtractionAssetTypes.Model, model.Id,
                ModelDtoMappings.ToTagNames(model.Tags), model.Description, cancellationToken);
        }

        metadata.RecordAutoAssignment(addedTags, assignedCategoryId, now);

        return new ImportAutomationResponse(
            model.Id, true, null, assignedCategoryId, assignedCategoryName, addedTags);
    }

    /// <summary>
    /// The category a concept label should assign to: an existing one whose name means the
    /// same thing, or a new one when the library has nothing like it.
    /// </summary>
    /// <remarks>
    /// Matching before creating is what keeps this usable on a curated library. A user with
    /// a "Vehicles" category gets their own category filled in; a user with an empty library
    /// gets one created rather than 1,700 uncategorised models.
    /// </remarks>
    private async Task<ModelCategory?> ResolveCategoryAsync(
        string label,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var display = CategoryNames.TryGetValue(label, out var name) ? name : label;

        var existing = await _categoryRepository.GetAllAsync(cancellationToken);
        // Compare on the singular form so "Vehicles", "Vehicle" and "vehicles" are one
        // category, matching how the tag vocabulary already normalises.
        var singular = SearchVocabulary.Singularize(label);
        var match = existing.FirstOrDefault(c =>
            NameTokenizer.Tokenize(c.Name).Any(t =>
                string.Equals(SearchVocabulary.Singularize(t), singular, StringComparison.OrdinalIgnoreCase)));
        if (match is not null)
        {
            return match;
        }

        var created = ModelCategory.Create(
            display,
            "Created automatically the first time an import was classified as this.",
            parentId: null,
            now);
        return await _categoryRepository.AddAsync(created, cancellationToken);
    }

    /// <summary>
    /// Adds the candidate tags the model does not already carry, and returns the names of
    /// the ones actually added. Additive: <see cref="Model.SetMetadata"/> replaces the whole
    /// set, so the model's existing tags are passed back in alongside the new ones.
    /// </summary>
    private async Task<IReadOnlyList<string>> AddTagsAsync(
        Model model,
        IReadOnlyList<string> candidates,
        DateTime now,
        CancellationToken cancellationToken)
    {
        if (candidates.Count == 0)
        {
            return Array.Empty<string>();
        }

        var have = new HashSet<string>(
            model.Tags.Select(t => t.NormalizedName), StringComparer.Ordinal);
        var wanted = ModelTag.SanitizeNames(candidates)
            .Where(n => !have.Contains(ModelTag.NormalizeName(n)))
            .ToList();
        if (wanted.Count == 0)
        {
            return Array.Empty<string>();
        }

        var resolved = await AssetTagResolver.ResolveAsync(
            _tagRepository, wanted, now, cancellationToken);
        if (resolved.Count == 0)
        {
            return Array.Empty<string>();
        }

        model.SetMetadata(model.Tags.Concat(resolved).ToList(), model.Description, now);
        return resolved.Select(t => t.Name).ToList();
    }
}
