using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Thumbnails;

public class GetEnvironmentMapThumbnailStatusQueryHandler
    : IQueryHandler<GetEnvironmentMapThumbnailStatusQuery, GetEnvironmentMapThumbnailStatusResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IThumbnailJobRepository _thumbnailJobRepository;

    public GetEnvironmentMapThumbnailStatusQueryHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IThumbnailJobRepository thumbnailJobRepository)
    {
        _environmentMapRepository = environmentMapRepository;
        _thumbnailJobRepository = thumbnailJobRepository;
    }

    public async Task<Result<GetEnvironmentMapThumbnailStatusResponse>> Handle(
        GetEnvironmentMapThumbnailStatusQuery query,
        CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(query.EnvironmentMapId, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure<GetEnvironmentMapThumbnailStatusResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {query.EnvironmentMapId} was not found."));
        }

        var previewVariant = environmentMap.GetPreviewVariant();
        if (previewVariant == null)
        {
            return Result.Success(new GetEnvironmentMapThumbnailStatusResponse(
                ThumbnailStatus.Pending, previewVariant?.Id, null, null, null));
        }

        if (!string.IsNullOrEmpty(previewVariant.ThumbnailPath))
        {
            return Result.Success(new GetEnvironmentMapThumbnailStatusResponse(
                ThumbnailStatus.Ready,
                previewVariant.Id,
                $"/environment-maps/{query.EnvironmentMapId}/preview",
                null,
                previewVariant.UpdatedAt));
        }

        var job = await _thumbnailJobRepository.GetByEnvironmentMapVariantIdAsync(
            previewVariant.Id, cancellationToken);

        var status = job?.Status switch
        {
            ThumbnailJobStatus.Processing => ThumbnailStatus.Processing,
            ThumbnailJobStatus.Dead => ThumbnailStatus.Failed,
            _ => ThumbnailStatus.Pending
        };

        return Result.Success(new GetEnvironmentMapThumbnailStatusResponse(
            status,
            previewVariant.Id,
            null,
            job?.ErrorMessage,
            null));
    }
}

public record GetEnvironmentMapThumbnailStatusQuery(int EnvironmentMapId)
    : IQuery<GetEnvironmentMapThumbnailStatusResponse>;

public record GetEnvironmentMapThumbnailStatusResponse(
    ThumbnailStatus Status,
    int? PreviewVariantId,
    string? FileUrl,
    string? ErrorMessage,
    DateTime? ProcessedAt);
