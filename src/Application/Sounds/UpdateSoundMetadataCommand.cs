using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Models;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Sounds;

/// <summary>
/// Replaces a sound's tags and description together (prompt 16-D).
///
/// Separate from <see cref="UpdateSoundCommand"/> (name + category) for the same reason
/// models keep the two apart: a metadata edit and a rename have different meanings for an
/// omitted field, and folding them into one command makes "leave the name alone" and
/// "clear the name" the same request.
/// </summary>
public record UpdateSoundMetadataCommand(
    int SoundId,
    IReadOnlyCollection<string>? Tags,
    string? Description) : ICommand<UpdateSoundMetadataResponse>;

public record UpdateSoundMetadataResponse(int SoundId, IReadOnlyList<string> Tags, string? Description);

internal sealed class UpdateSoundMetadataCommandHandler
    : ICommandHandler<UpdateSoundMetadataCommand, UpdateSoundMetadataResponse>
{
    private readonly ISoundRepository _sounds;
    private readonly IModelTagRepository _tags;
    private readonly IAssetSearchDocumentRepository _searchDocuments;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSoundMetadataCommandHandler(
        ISoundRepository sounds,
        IModelTagRepository tags,
        IAssetSearchDocumentRepository searchDocuments,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _sounds = sounds;
        _tags = tags;
        _searchDocuments = searchDocuments;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UpdateSoundMetadataResponse>> Handle(
        UpdateSoundMetadataCommand command, CancellationToken cancellationToken)
    {
        var sound = await _sounds.GetByIdAsync(command.SoundId, cancellationToken);
        if (sound is null)
        {
            return Result.Failure<UpdateSoundMetadataResponse>(
                new Error("SoundNotFound", $"Sound with ID {command.SoundId} was not found."));
        }

        var now = _clock.UtcNow;
        var assigned = await AssetTagResolver.ResolveAsync(_tags, command.Tags, now, cancellationToken);

        sound.SetMetadata(assigned, command.Description, now);
        await _sounds.UpdateAsync(sound, cancellationToken);

        // Same contract as the model command: the write that changes what a person said
        // about an asset changes what search can find it by, in the same transaction.
        await _searchDocuments.SetMetadataForAssetAsync(
            ExtractionAssetTypes.Sound,
            sound.Id,
            assigned.Select(t => t.Name).ToList(),
            sound.Description,
            cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateSoundMetadataResponse(
            sound.Id, sound.Tags.Select(t => t.Name).ToList(), sound.Description));
    }
}
