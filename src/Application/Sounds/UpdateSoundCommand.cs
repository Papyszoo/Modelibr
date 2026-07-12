using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Sounds;

internal class UpdateSoundCommandHandler : ICommandHandler<UpdateSoundCommand, UpdateSoundResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly ISoundCategoryRepository _soundCategoryRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSoundCommandHandler(
        ISoundRepository soundRepository,
        ISoundCategoryRepository soundCategoryRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _soundRepository = soundRepository;
        _soundCategoryRepository = soundCategoryRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
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
                // Renames follow the same DuplicateNamePolicy as creation: Allow keeps the
                // name as-is, Reject fails, AutoRename appends a numeric suffix. The
                // existence check excludes this sound itself so it can keep or re-case
                // its own name without tripping the Reject policy.
                var nameResult = await AssetNameService.ResolveNameAsync(
                    command.Name, "Sound",
                    async (name, ct) =>
                    {
                        var other = await _soundRepository.GetByNameAsync(name, ct);
                        return other != null && other.Id != sound.Id;
                    },
                    _soundRepository.GetNamesByPrefixAsync,
                    _settingRepository, cancellationToken);
                if (nameResult.IsFailure)
                {
                    return Result.Failure<UpdateSoundResponse>(
                        new Error("SoundAlreadyExists", $"A sound with the name '{command.Name}' already exists."));
                }

                sound.UpdateName(nameResult.Value, _dateTimeProvider.UtcNow);
            }

            if (command.CategoryId != sound.SoundCategoryId)
            {
                if (command.CategoryId.HasValue)
                {
                    var category = await _soundCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                    if (category == null)
                    {
                        return Result.Failure<UpdateSoundResponse>(
                            new Error("CategoryNotFound", $"Sound category with ID {command.CategoryId.Value} was not found."));
                    }
                }

                sound.UpdateCategory(command.CategoryId, _dateTimeProvider.UtcNow);
            }

            var savedSound = await _soundRepository.UpdateAsync(sound, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

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
