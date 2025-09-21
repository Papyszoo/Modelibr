using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.Files
{
    internal class GetFileQueryHandler : IQueryHandler<GetFileQuery, GetFileQueryResponse>
    {
        private readonly IFileRepository _fileRepository;
        private readonly IUploadPathProvider _pathProvider;

        public GetFileQueryHandler(IFileRepository fileRepository, IUploadPathProvider pathProvider)
        {
            _fileRepository = fileRepository;
            _pathProvider = pathProvider;
        }

        public async Task<Result<GetFileQueryResponse>> Handle(GetFileQuery query, CancellationToken cancellationToken)
        {
            var file = await _fileRepository.GetByIdAsync(query.Id, cancellationToken);
            
            if (file == null)
            {
                return Result.Failure<GetFileQueryResponse>(new Error("FileNotFound", "File not found"));
            }

            var fullPath = Path.Combine(_pathProvider.UploadRootPath, file.FilePath);
            if (!System.IO.File.Exists(fullPath))
            {
                return Result.Failure<GetFileQueryResponse>(new Error("FileNotFoundOnDisk", "File not found on disk"));
            }

            return Result.Success(new GetFileQueryResponse(file.Id, file.OriginalFileName, file.MimeType, fullPath));
        }
    }

    public record GetFileQuery(int Id) : IQuery<GetFileQueryResponse>;
    
    public record GetFileQueryResponse(int Id, string OriginalFileName, string MimeType, string FullPath);
}