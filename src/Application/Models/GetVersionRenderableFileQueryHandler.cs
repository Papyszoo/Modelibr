using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.Models;

internal class GetVersionRenderableFileQueryHandler : IQueryHandler<GetVersionRenderableFileQuery, GetVersionRenderableFileResponse>
{
    private readonly IModelVersionRepository _versionRepository;
    private readonly IUploadPathProvider _pathProvider;

    public GetVersionRenderableFileQueryHandler(
        IModelVersionRepository versionRepository,
        IUploadPathProvider pathProvider)
    {
        _versionRepository = versionRepository;
        _pathProvider = pathProvider;
    }

    public async Task<Result<GetVersionRenderableFileResponse>> Handle(
        GetVersionRenderableFileQuery query,
        CancellationToken cancellationToken)
    {
        var version = await _versionRepository.GetByIdAsync(query.VersionId, cancellationToken);

        if (version == null)
        {
            return Result.Failure<GetVersionRenderableFileResponse>(
                new Error("VersionNotFound", $"Model version with ID {query.VersionId} was not found."));
        }

        // Find the first renderable file in the version
        var renderableFile = version.Files.FirstOrDefault(f => f.FileType.IsRenderable);
        
        if (renderableFile == null)
        {
            return Result.Failure<GetVersionRenderableFileResponse>(
                new Error("NoRenderableFile", $"Model version {query.VersionId} has no renderable files."));
        }

        // Construct full path from relative path
        var fullPath = Path.Combine(_pathProvider.UploadRootPath, renderableFile.FilePath);
        
        // Ensure the directory exists before checking file existence
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        
        if (!System.IO.File.Exists(fullPath))
        {
            return Result.Failure<GetVersionRenderableFileResponse>(
                new Error("FileNotFoundOnDisk", $"Renderable file for version {query.VersionId} not found on disk"));
        }

        return Result.Success(new GetVersionRenderableFileResponse(
            renderableFile.Id,
            renderableFile.OriginalFileName,
            renderableFile.FilePath,
            fullPath,
            renderableFile.MimeType,
            renderableFile.FileType.Value,
            renderableFile.SizeBytes));
    }
}

public record GetVersionRenderableFileQuery(int VersionId) : IQuery<GetVersionRenderableFileResponse>;

public record GetVersionRenderableFileResponse(
    int FileId,
    string OriginalFileName,
    string FilePath,
    string FullPath,
    string MimeType,
    string FileType,
    long SizeBytes);
