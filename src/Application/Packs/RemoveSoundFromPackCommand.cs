using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Packs;

internal class RemoveSoundFromPackCommandHandler : ICommandHandler<RemoveSoundFromPackCommand>
{
    private readonly IPackRepository _packRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public RemoveSoundFromPackCommandHandler(
        IPackRepository packRepository,
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(RemoveSoundFromPackCommand command, CancellationToken cancellationToken)
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

        pack.RemoveSound(sound, _dateTimeProvider.UtcNow);

        await _packRepository.UpdateAsync(pack, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

public record RemoveSoundFromPackCommand(int PackId, int SoundId) : ICommand;
