using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Search;

internal sealed class AssetSearchQueryHandler
    : IQueryHandler<AssetSearchQuery, AssetSearchResponse>
{
    private const int MaxLimit = 100;

    private readonly ISearchRepository _searchRepository;
    private readonly ISearchLogRepository _searchLogRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IProjectRepository _projects;
    private readonly ISceneRepository _scenes;

    public AssetSearchQueryHandler(
        ISearchRepository searchRepository,
        ISearchLogRepository searchLogRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        IProjectRepository projects,
        ISceneRepository scenes)
    {
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

        // Search logging from day one: one row per deliberate search - query,
        // filters, and the results shown in rank order.
        await LogSearchAsync(query, request, response, cancellationToken);

        return Result.Success(response);
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
