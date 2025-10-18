using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Projects;

public sealed record AddTextureToProjectWithFileCommand(
    int ProjectId,
    IFileUpload File,
    string TextureSetName,
    TextureType TextureType,
    string? BatchId = null,
    string? UploadType = null
) : ICommand<int>;

internal sealed class AddTextureToProjectWithFileCommandHandler
    : ICommandHandler<AddTextureToProjectWithFileCommand, int>
{
    private readonly IProjectRepository _projectRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddTextureToProjectWithFileCommandHandler(
        IProjectRepository projectRepository,
        ITextureSetRepository textureSetRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider
    )
    {
        _projectRepository = projectRepository;
        _textureSetRepository = textureSetRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<int>> Handle(
        AddTextureToProjectWithFileCommand request,
        CancellationToken cancellationToken
    )
    {
        // Validate project exists
        var project = await _projectRepository.GetByIdAsync(request.ProjectId, cancellationToken);
        if (project == null)
        {
            return Result.Failure<int>(
                new Error("Project.NotFound", $"Project with ID {request.ProjectId} not found")
            );
        }

        // Validate file type
        var fileTypeResult = FileType.ValidateForUpload(request.File.FileName);
        if (!fileTypeResult.IsSuccess)
        {
            return Result.Failure<int>(fileTypeResult.Error);
        }

        var now = _dateTimeProvider.UtcNow;

        // Create or get existing file
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            request.File,
            fileTypeResult.Value,
            cancellationToken
        );

        if (!fileResult.IsSuccess)
        {
            return Result.Failure<int>(fileResult.Error);
        }

        var file = fileResult.Value;

        // Check if a texture set already exists with this file hash
        var existingTextureSet = await _textureSetRepository.GetByFileHashAsync(file.Sha256Hash, cancellationToken);
        
        TextureSet textureSet;
        if (existingTextureSet != null)
        {
            // Use existing texture set
            textureSet = existingTextureSet;
        }
        else
        {
            // Create new texture set
            textureSet = TextureSet.Create(request.TextureSetName, now);
            await _textureSetRepository.AddAsync(textureSet, cancellationToken);

            // Add texture to set
            var texture = Texture.Create(file, request.TextureType, now);
            textureSet.AddTexture(texture, now);
        }

        // Add texture set to project
        project.AddTextureSet(textureSet, now);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        // Create batch upload record
        var batchId = request.BatchId ?? Guid.NewGuid().ToString();
        var uploadType = request.UploadType ?? "project";

        var batchUpload = BatchUpload.Create(
            batchId,
            uploadType,
            file.Id,
            now,
            projectId: project.Id,
            textureSetId: textureSet.Id
        );

        await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);

        return Result.Success(textureSet.Id);
    }
}
