using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

/// <summary>
/// Persists source-image metadata (pixel dimensions and format) the worker
/// extracted for each texture in a set during thumbnail/proxy processing.
/// Best-effort: textures not found in the set are skipped rather than failing.
/// </summary>
public record UpdateTextureSetFileMetadataCommand(
    int TextureSetId,
    IReadOnlyList<TextureFileMetadataItem> Textures) : ICommand;

public record TextureFileMetadataItem(int TextureId, int? Width, int? Height, string? Format);

internal sealed class UpdateTextureSetFileMetadataCommandHandler : ICommandHandler<UpdateTextureSetFileMetadataCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureSetFileMetadataCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateTextureSetFileMetadataCommand command, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(new Error("TextureSet.NotFound", $"Texture set with ID {command.TextureSetId} not found."));
        }

        var now = _dateTimeProvider.UtcNow;
        var updated = false;

        foreach (var item in command.Textures)
        {
            var texture = textureSet.Textures.FirstOrDefault(t => t.Id == item.TextureId);
            if (texture == null)
                continue;

            texture.SetImageMetadata(item.Width, item.Height, item.Format, now);
            updated = true;
        }

        if (updated)
        {
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);
        }

        return Result.Success();
    }
}
