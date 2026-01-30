using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Sounds;

internal class CreateSoundCommandHandler : ICommandHandler<CreateSoundCommand, CreateSoundResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSoundCommandHandler(
        ISoundRepository soundRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _soundRepository = soundRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateSoundResponse>> Handle(CreateSoundCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var existingSound = await _soundRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingSound != null)
            {
                return Result.Failure<CreateSoundResponse>(
                    new Error("SoundAlreadyExists", $"A sound with the name '{command.Name}' already exists."));
            }

            var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
            if (file == null)
            {
                return Result.Failure<CreateSoundResponse>(
                    new Error("FileNotFound", $"File with ID {command.FileId} not found."));
            }

            var sound = Sound.Create(
                command.Name,
                file,
                command.Duration,
                command.Peaks,
                _dateTimeProvider.UtcNow,
                command.CategoryId);

            var savedSound = await _soundRepository.AddAsync(sound, cancellationToken);

            return Result.Success(new CreateSoundResponse(savedSound.Id, savedSound.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateSoundResponse>(
                new Error("SoundCreationFailed", ex.Message));
        }
    }
}

public record CreateSoundCommand(string Name, int FileId, double Duration, string? Peaks, int? CategoryId = null) : ICommand<CreateSoundResponse>;
public record CreateSoundResponse(int Id, string Name);
