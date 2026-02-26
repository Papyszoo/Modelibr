using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;
using FileTypeVO = Domain.ValueObjects.FileType;

namespace Application.TextureSets;

public record SetTextureWebProxyCommand(
    int TextureSetId,
    int TextureId,
    IFileUpload FileUpload,
    int Size
) : ICommand<SetTextureWebProxyResponse>;

public record SetTextureWebProxyResponse(
    int TextureProxyId,
    int TextureId,
    int FileId,
    int Size
);

internal class SetTextureWebProxyCommandHandler : ICommandHandler<SetTextureWebProxyCommand, SetTextureWebProxyResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ITextureProxyRepository _textureProxyRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<SetTextureWebProxyCommandHandler> _logger;

    public SetTextureWebProxyCommandHandler(
        ITextureSetRepository textureSetRepository,
        ITextureProxyRepository textureProxyRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider,
        ILogger<SetTextureWebProxyCommandHandler> logger)
    {
        _textureSetRepository = textureSetRepository;
        _textureProxyRepository = textureProxyRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
        _logger = logger;
    }

    public async Task<Result<SetTextureWebProxyResponse>> Handle(SetTextureWebProxyCommand command, CancellationToken cancellationToken)
    {
        // Validate size
        if (command.Size is not (256 or 512 or 1024 or 2048))
        {
            return Result.Failure<SetTextureWebProxyResponse>(
                new Error("InvalidSize", "Proxy size must be one of: 256, 512, 1024, 2048."));
        }

        // Verify texture set exists
        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure<SetTextureWebProxyResponse>(
                new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
        }

        // Verify texture exists in this set
        var texture = textureSet.Textures.FirstOrDefault(t => t.Id == command.TextureId);
        if (texture == null)
        {
            return Result.Failure<SetTextureWebProxyResponse>(
                new Error("TextureNotFound", $"Texture with ID {command.TextureId} was not found in texture set {command.TextureSetId}."));
        }

        // Determine file type from upload
        var fileTypeResult = FileTypeVO.FromFileName(command.FileUpload.FileName);
        if (fileTypeResult.IsFailure)
        {
            return Result.Failure<SetTextureWebProxyResponse>(fileTypeResult.Error);
        }
        var fileType = fileTypeResult.Value;

        // Store the proxy file (deduplication handled by FileCreationService)
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            command.FileUpload, fileType, cancellationToken);

        if (fileResult.IsFailure)
        {
            return Result.Failure<SetTextureWebProxyResponse>(fileResult.Error);
        }

        var proxyFile = fileResult.Value;

        // Check if a proxy already exists for this texture at this size
        var existingProxy = await _textureProxyRepository.GetByTextureIdAndSizeAsync(
            command.TextureId, command.Size, cancellationToken);

        TextureProxy proxy;
        if (existingProxy != null)
        {
            // Replace existing proxy — delete old one and create new
            await _textureProxyRepository.DeleteByTextureIdAsync(command.TextureId, cancellationToken);
            proxy = TextureProxy.Create(command.TextureId, proxyFile, command.Size, _dateTimeProvider.UtcNow);
            proxy = await _textureProxyRepository.AddAsync(proxy, cancellationToken);

            _logger.LogInformation(
                "Replaced texture proxy for Texture {TextureId} at size {Size}px with File {FileId}",
                command.TextureId, command.Size, proxyFile.Id);
        }
        else
        {
            proxy = TextureProxy.Create(command.TextureId, proxyFile, command.Size, _dateTimeProvider.UtcNow);
            proxy = await _textureProxyRepository.AddAsync(proxy, cancellationToken);

            _logger.LogInformation(
                "Created texture proxy for Texture {TextureId} at size {Size}px with File {FileId}",
                command.TextureId, command.Size, proxyFile.Id);
        }

        return Result.Success(new SetTextureWebProxyResponse(
            proxy.Id,
            proxy.TextureId,
            proxy.FileId,
            proxy.Size));
    }
}
