using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class AddScriptToProjectCommandHandler : ICommandHandler<AddScriptToProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IScriptRepository _scriptRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddScriptToProjectCommandHandler(
        IProjectRepository projectRepository,
        IScriptRepository scriptRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _scriptRepository = scriptRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddScriptToProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var script = await _scriptRepository.GetByIdAsync(command.ScriptId, cancellationToken);
        if (script == null)
        {
            return Result.Failure(
                new Error("ScriptNotFound", $"Script with ID {command.ScriptId} was not found."));
        }

        project.AddScript(script, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        return Result.Success();
    }
}

public record AddScriptToProjectCommand(int ProjectId, int ScriptId) : ICommand;
