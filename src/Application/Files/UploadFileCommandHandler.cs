using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Files
{
    internal class UploadFileCommandHandler : ICommandHandler<UploadFileCommand, UploadFileCommandResponse>
    {
        private readonly IFileCreationService _fileCreationService;
        private readonly IFilePersistence _filePersistence;

        public UploadFileCommandHandler(
            IFileCreationService fileCreationService,
            IFilePersistence filePersistence)
        {
            _fileCreationService = fileCreationService;
            _filePersistence = filePersistence;
        }

        public async Task<Result<UploadFileCommandResponse>> Handle(UploadFileCommand command, CancellationToken cancellationToken)
        {
            // Validate file type for upload using Value Object directly
            var fileTypeResult = FileType.ValidateForUpload(command.File.FileName);
            if (!fileTypeResult.IsSuccess)
            {
                return Result.Failure<UploadFileCommandResponse>(fileTypeResult.Error);
            }

            // Create or get existing file
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.File, 
                fileTypeResult.Value, 
                cancellationToken);

            if (!fileResult.IsSuccess)
            {
                return Result.Failure<UploadFileCommandResponse>(fileResult.Error);
            }

            var fileEntity = fileResult.Value;
            bool alreadyExists = fileEntity.Id != 0;

            // Persist the file to the database if it's new
            await _filePersistence.PersistAsync(fileEntity, cancellationToken);

            return Result.Success(new UploadFileCommandResponse(fileEntity.Id, alreadyExists));
        }
    }

    public record UploadFileCommand(IFileUpload File) : ICommand<UploadFileCommandResponse>;
    public record UploadFileCommandResponse(int FileId, bool AlreadyExists = false);
}
