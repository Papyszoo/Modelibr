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

    public AssetSearchQueryHandler(
        ISearchRepository searchRepository,
        ISearchLogRepository searchLogRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _searchRepository = searchRepository;
        _searchLogRepository = searchLogRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<AssetSearchResponse>> Handle(
        AssetSearchQuery query,
        CancellationToken cancellationToken)
    {
        // A blank term is a legitimate query: it means "everything matching the filters".
        // Returning empty here made every structural facet unusable on its own, so an
        // agent could not ask for "all rigged assets" without inventing a word.
        var term = query.Term?.Trim() ?? string.Empty;

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
            query.MinParts,
            query.MaxParts,
            query.MinVertices,
            query.MaxVertices,
            query.Category);

        var response = await _searchRepository.SearchAssetsAsync(request, cancellationToken);

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
            request.MinParts,
            request.MaxParts,
            request.MinVertices,
            request.MaxVertices,
            request.Category,
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
}
