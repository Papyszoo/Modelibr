using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Thumbnails;

public class GetVersionThumbnailQueryHandler : IQueryHandler<GetVersionThumbnailQuery, GetVersionThumbnailQueryResponse>
{
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IModelVersionRepository _modelVersionRepository;

    public GetVersionThumbnailQueryHandler(
        IThumbnailRepository thumbnailRepository,
        IModelVersionRepository modelVersionRepository)
    {
        _thumbnailRepository = thumbnailRepository;
        _modelVersionRepository = modelVersionRepository;
    }

    public async Task<Result<GetVersionThumbnailQueryResponse>> Handle(GetVersionThumbnailQuery query, CancellationToken cancellationToken)
    {
        // Verify version exists (including soft-deleted versions for recycled items view)
        var version = await _modelVersionRepository.GetByIdAsync(query.VersionId, cancellationToken)
                      ?? await _modelVersionRepository.GetDeletedByIdAsync(query.VersionId, cancellationToken);
        if (version == null)
        {
            return Result.Failure<GetVersionThumbnailQueryResponse>(
                new Error("VersionNotFound", $"Model version with ID {query.VersionId} was not found."));
        }

        var thumbnail = await _thumbnailRepository.GetByModelVersionIdAsync(query.VersionId, cancellationToken);
        
        if (thumbnail == null)
        {
            return Result.Success(new GetVersionThumbnailQueryResponse(
                ThumbnailStatus.Pending,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null));
        }

        // Paths are returned exactly as stored (relative to the uploads root), the
        // same contract as GetThumbnailStatusQueryResponse. Read sites that open
        // the file rebase them against the current root; returning an absolute
        // path here made the serving endpoints resolve an already-resolved value.
        return Result.Success(new GetVersionThumbnailQueryResponse(
            thumbnail.Status,
            thumbnail.ThumbnailPath,
            thumbnail.PngThumbnailPath,
            thumbnail.SizeBytes,
            thumbnail.Width,
            thumbnail.Height,
            thumbnail.ErrorMessage,
            thumbnail.CreatedAt,
            thumbnail.ProcessedAt));
    }
}

public record GetVersionThumbnailQuery(int VersionId) : IQuery<GetVersionThumbnailQueryResponse>;

public record GetVersionThumbnailQueryResponse(
    ThumbnailStatus Status,
    string? ThumbnailPath,
    string? PngThumbnailPath,
    long? SizeBytes,
    int? Width,
    int? Height,
    string? ErrorMessage,
    DateTime? CreatedAt,
    DateTime? ProcessedAt);
