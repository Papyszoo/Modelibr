using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Sounds;

internal class SoftDeleteSoundCommandHandler : ICommandHandler<SoftDeleteSoundCommand>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SoftDeleteSoundCommandHandler(
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SoftDeleteSoundCommand command, CancellationToken cancellationToken)
    {
        var sound = await _soundRepository.GetByIdAsync(command.Id, cancellationToken);
        if (sound == null)
        {
            return Result.Failure(
                new Error("SoundNotFound", $"Sound with ID {command.Id} not found."));
        }

        if (sound.IsDeleted)
        {
            return Result.Failure(
                new Error("SoundAlreadyDeleted", $"Sound with ID {command.Id} is already deleted."));
        }

        sound.SoftDelete(_dateTimeProvider.UtcNow);
        await _soundRepository.UpdateAsync(sound, cancellationToken);

        return Result.Success();
    }
}

public record SoftDeleteSoundCommand(int Id) : ICommand;
