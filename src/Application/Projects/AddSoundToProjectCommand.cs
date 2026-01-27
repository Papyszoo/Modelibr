using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class AddSoundToProjectCommandHandler : ICommandHandler<AddSoundToProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddSoundToProjectCommandHandler(
        IProjectRepository projectRepository,
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddSoundToProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var sound = await _soundRepository.GetByIdAsync(command.SoundId, cancellationToken);
        if (sound == null)
        {
            return Result.Failure(
                new Error("SoundNotFound", $"Sound with ID {command.SoundId} was not found."));
        }

        project.AddSound(sound, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        return Result.Success();
    }
}

public record AddSoundToProjectCommand(int ProjectId, int SoundId) : ICommand;
