using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Files
{
    internal class UploadFileCommandHandler : ICommandHandler<UploadFileCommand, UploadFileCommandResponse>
    {
        private readonly IFileCreationService _fileCreationService;
        private readonly IFilePersistence _filePersistence;
        private readonly IBatchUploadRepository _batchUploadRepository;
        private readonly IDateTimeProvider _dateTimeProvider;

        public UploadFileCommandHandler(
            IFileCreationService fileCreationService,
            IFilePersistence filePersistence,
            IBatchUploadRepository batchUploadRepository,
            IDateTimeProvider dateTimeProvider)
        {
            _fileCreationService = fileCreationService;
            _filePersistence = filePersistence;
            _batchUploadRepository = batchUploadRepository;
            _dateTimeProvider = dateTimeProvider;
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

            // Always track batch upload - generate batch ID if not provided
            var batchId = command.BatchId ?? Guid.NewGuid().ToString();
            
            // Determine upload type based on file type if not explicitly provided
            var uploadType = command.UploadType;
            if (string.IsNullOrWhiteSpace(uploadType))
            {
                // Auto-detect type based on file category
                uploadType = fileTypeResult.Value.Category switch
                {
                    FileTypeCategory.Texture => "texture",
                    FileTypeCategory.Model3D => "model",
                    _ => "file"
                };
            }
            
            var batchUpload = BatchUpload.Create(
                batchId,
                uploadType,
                fileEntity.Id,
                _dateTimeProvider.UtcNow,
                command.PackId,
                command.ModelId,
                command.TextureSetId);
            
            await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);

            return Result.Success(new UploadFileCommandResponse(fileEntity.Id, alreadyExists));
        }
    }

    public record UploadFileCommand(
        IFileUpload File,
        string? BatchId = null,
        string? UploadType = null,
        int? PackId = null,
        int? ModelId = null,
        int? TextureSetId = null) : ICommand<UploadFileCommandResponse>;
    
    public record UploadFileCommandResponse(int FileId, bool AlreadyExists = false);
}
