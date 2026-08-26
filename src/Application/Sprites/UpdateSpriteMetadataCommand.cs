using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Models;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Sprites;

/// <summary>
/// Replaces a sprite's tags and description together (prompt 16-D).
///
/// Separate from <see cref="UpdateSpriteCommand"/> (name, type + category) for the same reason
/// models keep the two apart: a metadata edit and a rename have different meanings for an
/// omitted field, and folding them into one command makes "leave the name alone" and
/// "clear the name" the same request.
/// </summary>
public record UpdateSpriteMetadataCommand(
    int SpriteId,
    IReadOnlyCollection<string>? Tags,
    string? Description) : ICommand<UpdateSpriteMetadataResponse>;

public record UpdateSpriteMetadataResponse(int SpriteId, IReadOnlyList<string> Tags, string? Description);

internal sealed class UpdateSpriteMetadataCommandHandler
    : ICommandHandler<UpdateSpriteMetadataCommand, UpdateSpriteMetadataResponse>
{
    private readonly ISpriteRepository _sprites;
    private readonly IModelTagRepository _tags;
    private readonly IAssetSearchDocumentRepository _searchDocuments;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSpriteMetadataCommandHandler(
        ISpriteRepository sprites,
        IModelTagRepository tags,
        IAssetSearchDocumentRepository searchDocuments,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _sprites = sprites;
        _tags = tags;
        _searchDocuments = searchDocuments;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UpdateSpriteMetadataResponse>> Handle(
        UpdateSpriteMetadataCommand command, CancellationToken cancellationToken)
    {
        var sprite = await _sprites.GetByIdAsync(command.SpriteId, cancellationToken);
        if (sprite is null)
        {
            return Result.Failure<UpdateSpriteMetadataResponse>(
                new Error("SpriteNotFound", $"Sprite with ID {command.SpriteId} was not found."));
        }

        var now = _clock.UtcNow;
        var assigned = await AssetTagResolver.ResolveAsync(_tags, command.Tags, now, cancellationToken);

        sprite.SetMetadata(assigned, command.Description, now);
        await _sprites.UpdateAsync(sprite, cancellationToken);

        // Same contract as the model command: the write that changes what a person said
        // about an asset changes what search can find it by, in the same transaction.
        await _searchDocuments.SetMetadataForAssetAsync(
            ExtractionAssetTypes.Sprite,
            sprite.Id,
            assigned.Select(t => t.Name).ToList(),
            sprite.Description,
            cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateSpriteMetadataResponse(
            sprite.Id, sprite.Tags.Select(t => t.Name).ToList(), sprite.Description));
    }
}
