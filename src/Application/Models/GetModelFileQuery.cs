using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.Models;

internal class GetModelFileQueryHandler : IQueryHandler<GetModelFileQuery, GetModelFileQueryResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IUploadPathProvider _pathProvider;

    public GetModelFileQueryHandler(IModelRepository modelRepository, IUploadPathProvider pathProvider)
    {
        _modelRepository = modelRepository;
        _pathProvider = pathProvider;
    }

    public async Task<Result<GetModelFileQueryResponse>> Handle(GetModelFileQuery query, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(query.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<GetModelFileQueryResponse>(
                new Error("ModelNotFound", $"Model with ID {query.ModelId} was not found."));
        }

        var renderableFile = model.Files.FirstOrDefault(f => f.FileType.IsRenderable);
        
        if (renderableFile == null)
        {
            return Result.Failure<GetModelFileQueryResponse>(
                new Error("NoRenderableFile", $"Model {query.ModelId} has no renderable files."));
        }

        var fullPath = Path.Combine(_pathProvider.UploadRootPath, renderableFile.FilePath);
        
        // Ensure the directory exists before checking file existence
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        
        if (!System.IO.File.Exists(fullPath))
        {
            return Result.Failure<GetModelFileQueryResponse>(
                new Error("FileNotFoundOnDisk", $"Model file for ID {query.ModelId} not found on disk"));
        }

        return Result.Success(new GetModelFileQueryResponse(
            renderableFile.Id,
            renderableFile.OriginalFileName,
            renderableFile.FilePath,
            fullPath,
            renderableFile.MimeType,
            renderableFile.FileType.Value,
            renderableFile.SizeBytes));
    }
}

public record GetModelFileQuery(int ModelId) : IQuery<GetModelFileQueryResponse>;

public record GetModelFileQueryResponse(
    int FileId,
    string OriginalFileName,
    string FilePath,
    string FullPath,
    string MimeType,
    string FileType,
    long SizeBytes);