using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Packs;

public sealed record AddTextureToPackWithFileCommand(
    int PackId,
    IFileUpload File,
    string TextureSetName,
    TextureType TextureType,
    string? BatchId = null,
    string? UploadType = null
) : ICommand<int>;

internal sealed class AddTextureToPackWithFileCommandHandler
    : ICommandHandler<AddTextureToPackWithFileCommand, int>
{
    private readonly IPackRepository _packRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddTextureToPackWithFileCommandHandler(
        IPackRepository packRepository,
        ITextureSetRepository textureSetRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider
    )
    {
        _packRepository = packRepository;
        _textureSetRepository = textureSetRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<int>> Handle(
        AddTextureToPackWithFileCommand request,
        CancellationToken cancellationToken
    )
    {
        // Validate pack exists
        var pack = await _packRepository.GetByIdAsync(request.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure<int>(
                new Error("Pack.NotFound", $"Pack with ID {request.PackId} not found")
            );
        }

        // Validate file type
        var fileTypeResult = FileType.ValidateForUpload(request.File.FileName);
        if (fileTypeResult.IsFailure)
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

        if (fileResult.IsFailure)
        {
            return Result.Failure<int>(fileResult.Error);
        }

        var file = fileResult.Value;

        // Create texture set
        var textureSet = TextureSet.Create(request.TextureSetName, now);
        await _textureSetRepository.AddAsync(textureSet, cancellationToken);

        // Add texture to set
        textureSet.AddTexture(file, request.TextureType, now);

        // Add texture set to pack
        pack.AddTextureSet(textureSet, now);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        // Create batch upload record
        var batchId = request.BatchId ?? Guid.NewGuid().ToString();
        var uploadType = request.UploadType ?? "pack";

        var batchUpload = BatchUpload.Create(
            batchId,
            uploadType,
            file.Id,
            now,
            packId: pack.Id,
            textureSetId: textureSet.Id
        );

        await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);

        return Result.Success(textureSet.Id);
    }
}
