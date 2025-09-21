using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Models;
using SharedKernel;

namespace Application.Models
{
    internal class AddFileToModelCommandHandler : ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse>
    {
        private readonly IFileStorage _storage;
        private readonly IModelRepository _modelRepository;
        private readonly IFileRepository _fileRepository;
        private readonly IFileUtilityService _fileUtilityService;

        public AddFileToModelCommandHandler(
            IFileStorage storage, 
            IModelRepository modelRepository, 
            IFileRepository fileRepository,
            IFileUtilityService fileUtilityService)
        {
            _storage = storage;
            _modelRepository = modelRepository;
            _fileRepository = fileRepository;
            _fileUtilityService = fileUtilityService;
        }

        public async Task<Result<AddFileToModelCommandResponse>> Handle(AddFileToModelCommand command, CancellationToken cancellationToken)
        {
            var original = Path.GetFileName(command.File.FileName);
            var ext = Path.GetExtension(original) ?? string.Empty;
            var fileType = FileTypeExtensions.GetFileTypeFromExtension(ext);

            // Calculate hash first to check for existing files before saving to disk
            var hash = await _fileUtilityService.CalculateFileHashAsync(command.File, cancellationToken);

            // Check if file already exists in database by hash
            var existingFile = await _fileRepository.GetBySha256HashAsync(hash, cancellationToken);
            
            Domain.Models.File fileEntity;
            if (existingFile != null)
            {
                // File already exists, check if it's already linked to this model
                if (existingFile.Models.Any(m => m.Id == command.ModelId))
                {
                    return Result.Success(new AddFileToModelCommandResponse(existingFile.Id, true));
                }
                
                fileEntity = existingFile;
            }
            else
            {
                // File doesn't exist, save to disk and create file entity
                var stored = await _storage.SaveAsync(command.File, Domain.Files.FileType.Model3D, cancellationToken);
                
                fileEntity = new Domain.Models.File
                {
                    OriginalFileName = original,
                    StoredFileName = stored.StoredName,
                    FilePath = stored.RelativePath,
                    MimeType = _fileUtilityService.GetMimeType(ext),
                    FileType = fileType,
                    SizeBytes = 0, // We'll set this properly later
                    Sha256Hash = stored.Sha256,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
            }

            try
            {
                await _modelRepository.AddFileAsync(command.ModelId, fileEntity, cancellationToken);
                return Result.Success(new AddFileToModelCommandResponse(fileEntity.Id, false));
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<AddFileToModelCommandResponse>(new Error("ModelNotFound", ex.Message));
            }
        }
    }

    public record AddFileToModelCommand(int ModelId, IFileUpload File) : ICommand<AddFileToModelCommandResponse>;
    public record AddFileToModelCommandResponse(int FileId, bool AlreadyLinked = false);
}