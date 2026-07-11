using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Sounds;

internal class DeleteSoundCommandHandler : ICommandHandler<DeleteSoundCommand>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSoundCommandHandler(ISoundRepository soundRepository,
        IUnitOfWork unitOfWork)
    {
        _soundRepository = soundRepository;
        _unitOfWork = unitOfWork;
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
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public record DeleteSoundCommand(int Id) : ICommand;
