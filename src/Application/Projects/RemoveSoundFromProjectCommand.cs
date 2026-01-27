using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class RemoveSoundFromProjectCommandHandler : ICommandHandler<RemoveSoundFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveSoundFromProjectCommandHandler(
        IProjectRepository projectRepository,
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveSoundFromProjectCommand command, CancellationToken cancellationToken)
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

        project.RemoveSound(sound, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        return Result.Success();
    }
}

public record RemoveSoundFromProjectCommand(int ProjectId, int SoundId) : ICommand;
