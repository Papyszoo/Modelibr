using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.Models;

internal class GetVersionFileQueryHandler : IQueryHandler<GetVersionFileQuery, GetVersionFileResponse>
{
    private readonly IModelVersionRepository _versionRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IUploadPathProvider _pathProvider;

    public GetVersionFileQueryHandler(
        IModelVersionRepository versionRepository,
        IFileRepository fileRepository,
        IUploadPathProvider pathProvider)
    {
        _versionRepository = versionRepository;
        _fileRepository = fileRepository;
        _pathProvider = pathProvider;
    }

    public async Task<Result<GetVersionFileResponse>> Handle(
        GetVersionFileQuery query,
        CancellationToken cancellationToken)
    {
        var version = await _versionRepository.GetByIdAsync(query.VersionId, cancellationToken);

        if (version == null)
        {
            return Result.Failure<GetVersionFileResponse>(
                new Error("VersionNotFound", $"Model version with ID {query.VersionId} was not found."));
        }

        // Find the file in the version
        var file = version.Files.FirstOrDefault(f => f.Id == query.FileId);
        
        if (file == null)
        {
            return Result.Failure<GetVersionFileResponse>(
                new Error("FileNotFound", $"File with ID {query.FileId} not found in version {query.VersionId}."));
        }

        // Construct full path from relative path
        var fullPath = Path.Combine(_pathProvider.UploadRootPath, file.FilePath);

        return Result.Success(new GetVersionFileResponse(
            fullPath,
            file.OriginalFileName,
            file.MimeType));
    }
}

public record GetVersionFileQuery(int VersionId, int FileId) : IQuery<GetVersionFileResponse>;

public record GetVersionFileResponse(
    string FilePath,
    string OriginalFileName,
    string MimeType);
