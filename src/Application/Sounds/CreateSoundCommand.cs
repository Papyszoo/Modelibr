using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Sounds;

internal class CreateSoundCommandHandler : ICommandHandler<CreateSoundCommand, CreateSoundResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly ISoundCategoryRepository _soundCategoryRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateSoundCommandHandler(
        ISoundRepository soundRepository,
        ISoundCategoryRepository soundCategoryRepository,
        IFileRepository fileRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _soundRepository = soundRepository;
        _soundCategoryRepository = soundCategoryRepository;
        _fileRepository = fileRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateSoundResponse>> Handle(CreateSoundCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Resolve name collision based on DuplicateNamePolicy setting (same as the
            // upload path): Allow keeps the name, Reject fails, AutoRename suffixes.
            var nameResult = await AssetNameService.ResolveNameAsync(
                command.Name, "Sound",
                _soundRepository.ExistsByNameAsync,
                _soundRepository.GetNamesByPrefixAsync,
                _settingRepository, cancellationToken);
            if (nameResult.IsFailure)
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

            if (command.CategoryId.HasValue)
            {
                var category = await _soundCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category == null)
                {
                    return Result.Failure<CreateSoundResponse>(
                        new Error("CategoryNotFound", $"Sound category with ID {command.CategoryId.Value} was not found."));
                }
            }

            var sound = Sound.Create(
                nameResult.Value,
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
