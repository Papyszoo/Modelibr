using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Models;

internal class GetModelFileQueryHandler : IQueryHandler<GetModelFileQuery, GetModelFileQueryResponse>
{
    private readonly IModelRepository _modelRepository;

    public GetModelFileQueryHandler(IModelRepository modelRepository)
    {
        _modelRepository = modelRepository;
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

        return Result.Success(new GetModelFileQueryResponse(
            renderableFile.Id,
            renderableFile.OriginalFileName,
            renderableFile.FilePath,
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
    string MimeType,
    string FileType,
    long SizeBytes);