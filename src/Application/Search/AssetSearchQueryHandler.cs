using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Media;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Search;

internal sealed class AssetSearchQueryHandler
    : IQueryHandler<AssetSearchQuery, AssetSearchResponse>
{
    private const int MaxLimit = 100;

    /// <summary>
    /// At or below this many assets, the response explains itself: how many assets carry each
    /// word on its own, and what the library does hold for a word it has never heard.
    ///
    /// It is a per-word query, so it is not run for a search that already answered. Three is
    /// the point where a caller stops choosing between candidates and starts guessing at
    /// another query - and a guess with no signal is what turns one call into four.
    /// </summary>
    private const int ThinResultThreshold = 3;

    private readonly ISearchRepository _searchRepository;
    private readonly ISearchLogRepository _searchLogRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IProjectRepository _projects;
    private readonly ISceneRepository _scenes;
    private readonly IAssetThumbnails _thumbnails;

    public AssetSearchQueryHandler(
        ISearchRepository searchRepository,
        ISearchLogRepository searchLogRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        IProjectRepository projects,
        ISceneRepository scenes,
        IAssetThumbnails thumbnails)
    {
        _thumbnails = thumbnails;
        _searchRepository = searchRepository;
        _searchLogRepository = searchLogRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
        _projects = projects;
        _scenes = scenes;
    }

    public async Task<Result<AssetSearchResponse>> Handle(
        AssetSearchQuery query,
        CancellationToken cancellationToken)
    {
        // A blank term is a legitimate query: it means "everything matching the filters".
        // Returning empty here made every structural facet unusable on its own, so an
        // agent could not ask for "all rigged assets" without inventing a word.
        var term = query.Term?.Trim() ?? string.Empty;

        var resolved = await ResolveProfileAsync(query, cancellationToken);
        if (resolved.IsFailure)
        {
            return Result.Failure<AssetSearchResponse>(resolved.Error);
        }

        var (bias, unapplied) = resolved.Value;

        var request = new AssetSearchRequest(
            term,
            Math.Clamp(query.Limit, 1, MaxLimit),
            query.IncludeSecondary,
            query.MinTriangles,
            query.MaxTriangles,
            query.HasAnimations,
            query.ShapeClass,
            query.Engine,
            query.AssetType,
            query.MinSize,
            query.MaxSize,
            query.HasRig,
            query.MinBones,
            query.MaxBones,
            query.MinMaterials,
            query.MaxMaterials,
            query.HasUvs,
            query.UvStatus,
            query.MinParts,
            query.MaxParts,
            query.MinVertices,
            query.MaxVertices,
            query.Category,
            query.Styles,
            query.Themes,
            query.License,
            bias);

        var response = await _searchRepository.SearchAssetsAsync(request, cancellationToken);

        // The repository reports what the profile did, because it is the only layer that knows
        // how many hits an enforced cap removed. When nothing was applied there is nothing for
        // it to report, and the reason lives here.
        if (unapplied is not null)
        {
            response = response with { Profile = unapplied };
        }

        // The picture, resolved for the whole page in one read. Without it, showing ten
        // candidates costs ten extra calls - and the choice cards resolve the same thing
        // through the same service, so the two surfaces cannot disagree about whether a
        // pinned asset has a preview.
        response = response with { Hits = await WithMediaAsync(response.Hits, cancellationToken) };

        response = response with
        {
            Query = await ExplainAsync(term, query.AssetType, response.TotalCount, cancellationToken),
        };

        // Search logging from day one: one row per deliberate search - query,
        // filters, and the results shown in rank order.
        await LogSearchAsync(query, request, response, cancellationToken);

        return Result.Success(response);
    }

    /// <summary>
    /// What the search understood, so a caller that got junk can fix it in one more call
    /// rather than three.
    ///
    /// The parse is free - it is the same pure function the repository ran - so the words
    /// kept and dropped are always reported. The per-word corpus counts are not free, and are
    /// measured only for a result thin enough that the caller is about to retry blind.
    /// </summary>
    private async Task<AssetSearchQueryView?> ExplainAsync(
        string term,
        string? assetType,
        int totalCount,
        CancellationToken cancellationToken)
    {
        var parsed = SearchQueryParser.Parse(term);
        if (parsed.IsEmpty && parsed.IgnoredWords.Count == 0)
        {
            // A blank query means "everything matching the filters". There is no query to
            // explain, and an empty explanation on every browse call is noise.
            return null;
        }

        var diagnostics = totalCount <= ThinResultThreshold && !parsed.IsEmpty
            ? await _searchRepository.ExplainTermsAsync(parsed.Terms, assetType, cancellationToken)
            : Array.Empty<SearchTermDiagnostic>();

        // The words kept and dropped are still worth reporting when the counts are missing.
        // This block explains a search; it must never be the reason one fails.
        var byWord = (diagnostics ?? Array.Empty<SearchTermDiagnostic>())
            .ToDictionary(d => d.Word, StringComparer.OrdinalIgnoreCase);

        var terms = parsed.Terms
            .Select(t => byWord.TryGetValue(t.Word, out var d)
                ? new SearchTermView(t.Word, t.Variants, d.Matches, d.NearestNames.Count == 0 ? null : d.NearestNames)
                : new SearchTermView(t.Word, t.Variants))
            .ToList();

        return new AssetSearchQueryView(
            parsed.Original,
            terms,
            parsed.IgnoredWords.Select(w => new SearchIgnoredWordView(w.Word, w.Reason)).ToList(),
            Note(terms, parsed, totalCount));
    }

    /// <summary>
    /// One sentence, or nothing. A caller reading a thin result should not have to compare two
    /// arrays to notice that half its words are not in this library.
    /// </summary>
    private static string? Note(
        IReadOnlyList<SearchTermView> terms,
        SearchQueryParser.ParsedQuery parsed,
        int totalCount)
    {
        var unknown = terms.Where(t => t.Matches == 0).Select(t => t.Word).ToList();
        if (unknown.Count > 0)
        {
            var suggestions = terms
                .Where(t => t.Matches == 0 && t.DidYouMean is { Count: > 0 })
                .SelectMany(t => t.DidYouMean!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(3)
                .ToList();

            var nearest = suggestions.Count == 0
                ? " Nothing in the library is close to it - try a broader word, or search with filters alone."
                : $" The nearest names here are: {string.Join(", ", suggestions)}.";

            return unknown.Count == terms.Count
                ? $"No asset in this library carries {Words(unknown)}, so nothing this search returned matched on {(unknown.Count == 1 ? "it" : "them")}.{nearest}"
                : $"No asset in this library carries {Words(unknown)}; the search ran on the rest.{nearest}";
        }

        var beyondLimit = parsed.IgnoredWords
            .Where(w => w.Reason == SearchQueryParser.IgnoredReasons.BeyondWordLimit)
            .Select(w => w.Word)
            .ToList();

        if (beyondLimit.Count > 0)
        {
            return $"Only the first {SearchQueryParser.MaxTerms} words were scored; {Words(beyondLimit)} {(beyondLimit.Count == 1 ? "was" : "were")} not. Put the words that matter first.";
        }

        return totalCount == 0 && parsed.Terms.Count > 1
            ? "Every word is known here, but no asset carries enough of them together. Drop the least important word and search again."
            : null;
    }

    private static string Words(IReadOnlyList<string> words)
        => string.Join(", ", words.Select(w => $"'{w}'"));

    private async Task<IReadOnlyList<AssetSearchHit>> WithMediaAsync(
        IReadOnlyList<AssetSearchHit> hits,
        CancellationToken cancellationToken)
    {
        if (hits.Count == 0)
        {
            return hits;
        }

        var thumbnails = await _thumbnails.ResolveAsync(
            hits.Select(h => new AssetThumbnailRef(h.AssetType, h.AssetId, h.VersionId)),
            cancellationToken);

        return hits
            .Select(hit => hit with
            {
                Media = thumbnails.GetValueOrDefault(
                    new AssetThumbnailRef(hit.AssetType, hit.AssetId, hit.VersionId).Key),
            })
            .ToList();
    }

    private async Task LogSearchAsync(
        AssetSearchQuery query,
        AssetSearchRequest request,
        AssetSearchResponse response,
        CancellationToken cancellationToken)
    {
        var filters = new
        {
            request.IncludeSecondary,
            request.MinTriangles,
            request.MaxTriangles,
            request.HasAnimations,
            request.ShapeClass,
            request.Engine,
            request.AssetType,
            request.MinSize,
            request.MaxSize,
            request.HasRig,
            request.MinBones,
            request.MaxBones,
            request.MinMaterials,
            request.MaxMaterials,
            request.HasUvs,
            request.UvStatus,
            request.MinParts,
            request.MaxParts,
            request.MinVertices,
            request.MaxVertices,
            request.Category,
            request.Styles,
            request.Themes,
            request.License,
            ProfileProjectId = request.Profile?.ProjectId,
            ProfileMode = request.Profile?.Mode ?? query.ApplyProfile,
            ProfileTriangleCap = request.Profile?.TriangleCap,
        };
        var resultsShown = response.Hits
            .Select(h => new { h.AssetType, h.AssetId, h.PartPath })
            .ToList();

        var log = SearchLog.Create(
            query.Term ?? string.Empty,
            JsonSerializer.Serialize(filters),
            JsonSerializer.Serialize(resultsShown),
            response.TotalCount,
            _dateTimeProvider.UtcNow);

        await _searchLogRepository.AddAsync(log, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Works out which project this search runs for, and how much of its profile applies
    /// (prompt 13-D3).
    /// </summary>
    /// <returns>
    /// The bias to hand the repository, or - when a profile was asked for and none took
    /// effect - the view that says why. Never both, and never neither silently.
    /// </returns>
    private async Task<Result<(ProfileSearchBias? Bias, AssetSearchProfileView? Unapplied)>> ResolveProfileAsync(
        AssetSearchQuery query,
        CancellationToken cancellationToken)
    {
        var asked = query.ProjectId is not null || query.SceneId is not null || query.ApplyProfile is not null;
        if (!asked)
        {
            return Result.Success<(ProfileSearchBias?, AssetSearchProfileView?)>((null, null));
        }

        // An unrecognised mode fails rather than falling back to the default. A caller that
        // typed "enforced" and silently got "bias" would read a budget as applied when it was
        // only reported - which is the one misreading this parameter exists to prevent.
        var mode = query.ApplyProfile is null
            ? AssetSearchProfileModes.Bias
            : AssetSearchProfileModes.Normalize(query.ApplyProfile);

        if (mode is null)
        {
            return Result.Failure<(ProfileSearchBias?, AssetSearchProfileView?)>(
                new Error(
                    "search.invalid_apply_profile",
                    $"applyProfile must be one of {string.Join(", ", AssetSearchProfileModes.All)}; got '{query.ApplyProfile}'."));
        }

        int? projectId = query.ProjectId;

        if (projectId is null && query.SceneId is int sceneId)
        {
            var scene = await _scenes.GetByIdAsync(sceneId, cancellationToken);
            if (scene is null)
            {
                return Result.Failure<(ProfileSearchBias?, AssetSearchProfileView?)>(
                    new Error("scene.not_found", $"Scene {sceneId} was not found."));
            }

            if (scene.ProjectId is null)
            {
                // Not an error: belonging to no project is the normal state of most scenes,
                // and the answer is the unbiased library rather than a refusal.
                return Result.Success<(ProfileSearchBias?, AssetSearchProfileView?)>((null,
                    new AssetSearchProfileView(
                        mode,
                        Applied: false,
                        Note: $"Scene {sceneId} belongs to no project, so no profile was applied. "
                              + "Link it with set_scene_project, or pass projectId directly.")));
            }

            projectId = scene.ProjectId;
        }

        if (projectId is null)
        {
            return Result.Success<(ProfileSearchBias?, AssetSearchProfileView?)>((null,
                new AssetSearchProfileView(
                    mode,
                    Applied: false,
                    Note: $"applyProfile: \"{mode}\" was given without a projectId or sceneId, "
                          + "so there was no profile to apply.")));
        }

        var project = await _projects.GetByIdAsync(projectId.Value, cancellationToken);
        if (project is null)
        {
            return Result.Failure<(ProfileSearchBias?, AssetSearchProfileView?)>(
                new Error("project.not_found", $"Project {projectId} was not found."));
        }

        if (string.Equals(mode, AssetSearchProfileModes.Off, StringComparison.Ordinal))
        {
            return Result.Success<(ProfileSearchBias?, AssetSearchProfileView?)>((null,
                new AssetSearchProfileView(
                    mode,
                    Applied: false,
                    ProjectId: project.Id,
                    ProjectName: project.Name,
                    Note: "applyProfile: \"off\" - this project's style and budget were not applied.")));
        }

        var bias = ProfileSearchBiasBuilder.Build(project, mode);

        // A profile that constrains nothing is reported, not applied: running the ranking
        // machinery for a project with no styles and no budget would cost a scan and change
        // no order at all.
        return bias.IsInert
            ? Result.Success<(ProfileSearchBias?, AssetSearchProfileView?)>((null,
                new AssetSearchProfileView(
                    mode,
                    Applied: false,
                    ProjectId: bias.ProjectId,
                    ProjectName: bias.ProjectName,
                    TriangleCap: bias.TriangleCap,
                    TriangleCapSource: bias.TriangleCapSource,
                    Note: $"{bias.ProjectName} declares no style and no triangle budget, "
                          + "so its profile cannot change what search returns yet.")))
            : Result.Success<(ProfileSearchBias?, AssetSearchProfileView?)>((bias, null));
    }
}
