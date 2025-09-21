using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
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

        public AddFileToModelCommandHandler(IFileStorage storage, IModelRepository modelRepository, IFileRepository fileRepository)
        {
            _storage = storage;
            _modelRepository = modelRepository;
            _fileRepository = fileRepository;
        }

        public async Task<Result<AddFileToModelCommandResponse>> Handle(AddFileToModelCommand command, CancellationToken cancellationToken)
        {
            var original = Path.GetFileName(command.File.FileName);
            var ext = Path.GetExtension(original) ?? string.Empty;
            var fileType = FileTypeExtensions.GetFileTypeFromExtension(ext);

            var stored = await _storage.SaveAsync(command.File, Domain.Files.FileType.Model3D, cancellationToken);

            // Check if file already exists in database by hash
            var existingFile = await _fileRepository.GetBySha256HashAsync(stored.Sha256, cancellationToken);
            
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
                // Create new File entity
                fileEntity = new Domain.Models.File
                {
                    OriginalFileName = original,
                    StoredFileName = stored.StoredName,
                    FilePath = stored.RelativePath,
                    MimeType = GetMimeType(ext),
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
                ".jpg" => "image/jpeg",
                ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".tga" => "image/tga",
                ".bmp" => "image/bmp",
                ".mtl" => "text/plain",
                ".max" => "application/octet-stream",
                ".ma" => "application/octet-stream",
                ".mb" => "application/octet-stream",
                _ => "application/octet-stream"
            };
        }
    }

    public record AddFileToModelCommand(int ModelId, IFileUpload File) : ICommand<AddFileToModelCommandResponse>;
    public record AddFileToModelCommandResponse(int FileId, bool AlreadyLinked = false);
}