using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.RecycledFiles;

public record GetAllRecycledFilesQuery : IQuery<GetAllRecycledFilesResponse>;

public record GetAllRecycledFilesResponse(List<RecycledFileDto> RecycledFiles);

public record RecycledFileDto(
    int Id,
    string OriginalFileName,
    string StoredFileName,
    string FilePath,
    string Sha256Hash,
    long SizeBytes,
    string Reason,
    DateTime RecycledAt,
    DateTime? ScheduledDeletionAt
);

internal class GetAllRecycledFilesQueryHandler : IQueryHandler<GetAllRecycledFilesQuery, GetAllRecycledFilesResponse>
{
    private readonly IRecycledFileRepository _recycledFileRepository;

    public GetAllRecycledFilesQueryHandler(IRecycledFileRepository recycledFileRepository)
    {
        _recycledFileRepository = recycledFileRepository;
    }

    public async Task<Result<GetAllRecycledFilesResponse>> Handle(GetAllRecycledFilesQuery query, CancellationToken cancellationToken)
    {
        var recycledFiles = await _recycledFileRepository.GetAllAsync(cancellationToken);

        var dtos = recycledFiles.Select(rf => new RecycledFileDto(
            rf.Id,
            rf.OriginalFileName,
            rf.StoredFileName,
            rf.FilePath,
            rf.Sha256Hash,
            rf.SizeBytes,
            rf.Reason,
            rf.RecycledAt,
            rf.ScheduledDeletionAt
        )).ToList();

        return Result.Success(new GetAllRecycledFilesResponse(dtos));
    }
}
