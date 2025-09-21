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
    internal class AddModelCommandHandler : ICommandHandler<AddModelCommand, AddModelCommandResponse>
    {
        private readonly IFileStorage _storage;
        private readonly IModelRepository _modelRepository;
        private readonly IFileRepository _fileRepository;
        private readonly IFileUtilityService _fileUtilityService;

        public AddModelCommandHandler(
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

        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            var original = Path.GetFileName(command.File.FileName);
            var ext = Path.GetExtension(original) ?? string.Empty;
            var fileType = FileTypeExtensions.GetFileTypeFromExtension(ext);

            // Only accept renderable files for model upload
            if (!fileType.IsRenderable())
            {
                return Result.Failure<AddModelCommandResponse>(
                    new Error("InvalidFileType", $"File type '{ext}' is not supported for model upload. Only .obj, .fbx, .gltf, and .glb files are allowed."));
            }

            // Calculate hash first to check for existing files/models before saving to disk
            var hash = await _fileUtilityService.CalculateFileHashAsync(command.File, cancellationToken);

            // Check if a model already exists with this file hash
            var existingModel = await _modelRepository.GetByFileHashAsync(hash, cancellationToken);
            if (existingModel != null)
            {
                return Result.Success(new AddModelCommandResponse(existingModel.Id, true));
            }

            // Check if file already exists in database by hash
            var existingFile = await _fileRepository.GetBySha256HashAsync(hash, cancellationToken);
            
            Domain.Models.File fileEntity;
            if (existingFile != null)
            {
                // File already exists, reuse it but create new model
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

            // Create and persist Model entity to database
            var model = new Model
            {
                Name = command.ModelName ?? Path.GetFileNameWithoutExtension(original),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            // Add the file to the model
            model.Files.Add(fileEntity);

            var savedModel = await _modelRepository.AddAsync(model, cancellationToken);

            return Result.Success(new AddModelCommandResponse(savedModel.Id, false));
        }
    }

    public record AddModelCommand(IFileUpload File, string? ModelName = null) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id, bool AlreadyExists = false);
}
