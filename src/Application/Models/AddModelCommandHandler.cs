using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
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

        public AddModelCommandHandler(IFileStorage storage, IModelRepository modelRepository, IFileRepository fileRepository)
        {
            _storage = storage;
            _modelRepository = modelRepository;
            _fileRepository = fileRepository;
        }

        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            var original = Path.GetFileName(command.File.FileName);
            var ext = Path.GetExtension(original) ?? string.Empty;

            var stored = await _storage.SaveAsync(command.File, FileType.Model3D, cancellationToken);

            // Check if file already exists in database by hash
            var existingFile = await _fileRepository.GetBySha256HashAsync(stored.Sha256, cancellationToken);
            
            Domain.Models.File fileEntity;
            if (existingFile != null)
            {
                // File already exists, reuse it
                fileEntity = existingFile;
            }
            else
            {
                // Create new File entity
                fileEntity = new Domain.Models.File
                {
                    OriginalFileName = original,
                    StoredFileName = stored.StoredName,
                    FilePath = stored.RelativePath,
                    MimeType = GetMimeType(ext),
                    SizeBytes = 0, // We'll set this properly later
                    Sha256Hash = stored.Sha256,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                fileEntity = await _fileRepository.AddAsync(fileEntity, cancellationToken);
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

            return Result.Success(new AddModelCommandResponse(savedModel.Id));
        }

        private static string GetMimeType(string extension)
        {
            return extension.ToLowerInvariant() switch
            {
                ".obj" => "model/obj",
                ".blend" => "application/x-blender",
                ".gltf" => "model/gltf+json",
                ".glb" => "model/gltf-binary",
                ".fbx" => "application/octet-stream",
                ".dae" => "model/vnd.collada+xml",
                ".3ds" => "application/x-3ds",
                ".ply" => "application/octet-stream",
                ".stl" => "model/stl",
                _ => "application/octet-stream"
            };
        }
    }

    public record AddModelCommand(IFileUpload File, string? ModelName = null) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id);
}
