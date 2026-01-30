using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Sounds;

internal class UpdateSoundCommandHandler : ICommandHandler<UpdateSoundCommand, UpdateSoundResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSoundCommandHandler(
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateSoundResponse>> Handle(UpdateSoundCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var sound = await _soundRepository.GetByIdAsync(command.Id, cancellationToken);
            if (sound == null)
            {
                return Result.Failure<UpdateSoundResponse>(
                    new Error("SoundNotFound", $"Sound with ID {command.Id} not found."));
            }

            if (!string.IsNullOrWhiteSpace(command.Name) && command.Name != sound.Name)
            {
                var existingSound = await _soundRepository.GetByNameAsync(command.Name, cancellationToken);
                if (existingSound != null && existingSound.Id != sound.Id)
                {
                    return Result.Failure<UpdateSoundResponse>(
                        new Error("SoundAlreadyExists", $"A sound with the name '{command.Name}' already exists."));
                }

                sound.UpdateName(command.Name, _dateTimeProvider.UtcNow);
            }

            if (command.CategoryId != sound.SoundCategoryId)
            {
                sound.UpdateCategory(command.CategoryId, _dateTimeProvider.UtcNow);
            }

            var savedSound = await _soundRepository.UpdateAsync(sound, cancellationToken);

            return Result.Success(new UpdateSoundResponse(savedSound.Id, savedSound.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateSoundResponse>(
                new Error("SoundUpdateFailed", ex.Message));
        }
    }
}

public record UpdateSoundCommand(int Id, string? Name, int? CategoryId) : ICommand<UpdateSoundResponse>;
public record UpdateSoundResponse(int Id, string Name);
