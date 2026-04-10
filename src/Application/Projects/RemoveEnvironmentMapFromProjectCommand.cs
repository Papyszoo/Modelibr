using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal sealed class RemoveEnvironmentMapFromProjectCommandHandler : ICommandHandler<RemoveEnvironmentMapFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveEnvironmentMapFromProjectCommandHandler(
        IProjectRepository projectRepository,
        IEnvironmentMapRepository environmentMapRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _environmentMapRepository = environmentMapRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveEnvironmentMapFromProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
            return Result.Failure(new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
        if (environmentMap == null)
            return Result.Failure(new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));

        project.RemoveEnvironmentMap(environmentMap, _dateTimeProvider.UtcNow);
        await _projectRepository.UpdateAsync(project, cancellationToken);
        return Result.Success();
    }
}

public record RemoveEnvironmentMapFromProjectCommand(int ProjectId, int EnvironmentMapId) : ICommand;
