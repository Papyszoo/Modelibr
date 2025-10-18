using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.BatchUploads;

public record GetBatchUploadHistoryQuery() : IQuery<GetBatchUploadHistoryResponse>;

public record GetBatchUploadHistoryResponse(List<BatchUploadHistoryDto> Uploads);

public record BatchUploadHistoryDto(
    int Id,
    string BatchId,
    string UploadType,
    DateTime UploadedAt,
    int FileId,
    string FileName,
    int? PackId,
    string? PackName,
    int? ProjectId,
    string? ProjectName,
    int? ModelId,
    string? ModelName,
    int? TextureSetId,
    string? TextureSetName
);

internal class GetBatchUploadHistoryQueryHandler : IQueryHandler<GetBatchUploadHistoryQuery, GetBatchUploadHistoryResponse>
{
    private readonly IBatchUploadRepository _batchUploadRepository;

    public GetBatchUploadHistoryQueryHandler(IBatchUploadRepository batchUploadRepository)
    {
        _batchUploadRepository = batchUploadRepository;
    }

    public async Task<Result<GetBatchUploadHistoryResponse>> Handle(GetBatchUploadHistoryQuery query, CancellationToken cancellationToken)
    {
        // Get all batch uploads ordered by date descending
        var allUploads = await _batchUploadRepository.GetByDateRangeAsync(
            DateTime.UtcNow.AddYears(-10), // Get uploads from the last 10 years
            DateTime.UtcNow.AddDays(1),
            cancellationToken);

        var historyDtos = allUploads
            .OrderByDescending(bu => bu.UploadedAt)
            .Select(bu => new BatchUploadHistoryDto(
                bu.Id,
                bu.BatchId,
                bu.UploadType,
                bu.UploadedAt,
                bu.FileId,
                bu.File?.OriginalFileName ?? "Unknown",
                bu.PackId,
                bu.Pack?.Name,
                bu.ProjectId,
                bu.Project?.Name,
                bu.ModelId,
                bu.Model?.Name,
                bu.TextureSetId,
                bu.TextureSet?.Name
            ))
            .ToList();

        return Result.Success(new GetBatchUploadHistoryResponse(historyDtos));
    }
}
