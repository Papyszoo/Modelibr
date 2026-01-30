using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class AddSoundToPackCommandHandler : ICommandHandler<AddSoundToPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddSoundToPackCommandHandler(
        IPackRepository packRepository,
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _packRepository = packRepository;
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddSoundToPackCommand command, CancellationToken cancellationToken)
    {
        var pack = await _packRepository.GetByIdAsync(command.PackId, cancellationToken);
        if (pack == null)
        {
            return Result.Failure(
                new Error("PackNotFound", $"Pack with ID {command.PackId} was not found."));
        }

        var sound = await _soundRepository.GetByIdAsync(command.SoundId, cancellationToken);
        if (sound == null)
        {
            return Result.Failure(
                new Error("SoundNotFound", $"Sound with ID {command.SoundId} was not found."));
        }

        pack.AddSound(sound, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        return Result.Success();
    }
}

public record AddSoundToPackCommand(int PackId, int SoundId) : ICommand;
