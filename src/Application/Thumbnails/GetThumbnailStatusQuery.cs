using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Thumbnails;

public class GetThumbnailStatusQueryHandler : IQueryHandler<GetThumbnailStatusQuery, GetThumbnailStatusQueryResponse>
{
    private readonly IModelRepository _modelRepository;

    public GetThumbnailStatusQueryHandler(IModelRepository modelRepository)
    {
        _modelRepository = modelRepository;
    }

    public async Task<Result<GetThumbnailStatusQueryResponse>> Handle(GetThumbnailStatusQuery query, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(query.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<GetThumbnailStatusQueryResponse>(
                new Error("ModelNotFound", $"Model with ID {query.ModelId} was not found."));
        }

        var activeVersionId = model.ActiveVersionId;
        var thumbnail = model.ActiveVersion?.Thumbnail;
        if (thumbnail == null)
        {
            return Result.Success(new GetThumbnailStatusQueryResponse(
                ThumbnailStatus.Pending,
                activeVersionId,
                null,
                null,
                null,
                null,
                null,
                null,
                null));
        }

        return Result.Success(new GetThumbnailStatusQueryResponse(
            thumbnail.Status,
            activeVersionId,
            thumbnail.ThumbnailPath,
            thumbnail.SizeBytes,
            thumbnail.Width,
            thumbnail.Height,
            thumbnail.ErrorMessage,
            thumbnail.CreatedAt,
            thumbnail.ProcessedAt));
    }
}

public record GetThumbnailStatusQuery(int ModelId) : IQuery<GetThumbnailStatusQueryResponse>;

public record GetThumbnailStatusQueryResponse(
    ThumbnailStatus Status,
    int? ActiveVersionId,
    string? ThumbnailPath,
    long? SizeBytes,
    int? Width,
    int? Height,
    string? ErrorMessage,
    DateTime? CreatedAt,
    DateTime? ProcessedAt);