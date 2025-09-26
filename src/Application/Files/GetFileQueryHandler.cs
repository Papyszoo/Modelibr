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
            
            // Ensure the directory exists with proper permissions before checking file existence
            var directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
                
                // Ensure the directory is accessible by setting appropriate permissions
                // This handles cases where directory permissions were reset after container recreation
                try
                {
                    var dirInfo = new DirectoryInfo(directory);
                    if (dirInfo.Exists)
                    {
                        // Test write access by attempting to create and delete a temporary file
                        var testFile = Path.Combine(directory, $".access_test_{Guid.NewGuid():N}");
                        File.WriteAllText(testFile, "test");
                        File.Delete(testFile);
                    }
                }
                catch (UnauthorizedAccessException)
                {
                    // If we can't write to the directory, return an appropriate error
                    return Result.Failure<GetFileQueryResponse>(
                        new Error("DirectoryAccessDenied", $"Cannot access directory: {directory}"));
                }
                catch (IOException)
                {
                    // Handle other IO exceptions that might indicate permission issues
                    return Result.Failure<GetFileQueryResponse>(
                        new Error("DirectoryIOError", $"IO error accessing directory: {directory}"));
                }
            }
            
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