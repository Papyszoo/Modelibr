using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class SetEnvironmentMapCustomThumbnailCommandHandler : ICommandHandler<SetEnvironmentMapCustomThumbnailCommand>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetEnvironmentMapCustomThumbnailCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SetEnvironmentMapCustomThumbnailCommand command, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
        }

        Domain.Models.File? file = null;
        if (command.FileId.HasValue)
        {
            file = await _fileRepository.GetByIdAsync(command.FileId.Value, cancellationToken);
            if (file == null)
            {
                return Result.Failure(new Error("FileNotFound", $"File with ID {command.FileId.Value} was not found."));
            }
        }

        environmentMap.SetCustomThumbnail(file, _dateTimeProvider.UtcNow);
        await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
        return Result.Success();
    }
}

public record SetEnvironmentMapCustomThumbnailCommand(int EnvironmentMapId, int? FileId) : ICommand;
