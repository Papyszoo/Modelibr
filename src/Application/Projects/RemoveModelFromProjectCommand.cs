using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class RemoveModelFromProjectCommandHandler : ICommandHandler<RemoveModelFromProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveModelFromProjectCommandHandler(
        IProjectRepository projectRepository,
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveModelFromProjectCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);

        if (project == null)
        {
            return Result.Failure(
                new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);

        if (model == null)
        {
            return Result.Failure(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        project.RemoveModel(model, _dateTimeProvider.UtcNow);

        await _projectRepository.UpdateAsync(project, cancellationToken);

        return Result.Success();
    }
}

public record RemoveModelFromProjectCommand(int ProjectId, int ModelId) : ICommand;
