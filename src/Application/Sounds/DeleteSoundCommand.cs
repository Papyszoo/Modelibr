using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Sounds;

internal class DeleteSoundCommandHandler : ICommandHandler<DeleteSoundCommand>
{
    private readonly ISoundRepository _soundRepository;

    public DeleteSoundCommandHandler(ISoundRepository soundRepository)
    {
        _soundRepository = soundRepository;
    }

    public async Task<Result> Handle(DeleteSoundCommand command, CancellationToken cancellationToken)
    {
        var sound = await _soundRepository.GetByIdAsync(command.Id, cancellationToken);
        if (sound == null)
        {
            return Result.Failure(
                new Error("SoundNotFound", $"Sound with ID {command.Id} not found."));
        }

        await _soundRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success();
    }
}

public record DeleteSoundCommand(int Id) : ICommand;
