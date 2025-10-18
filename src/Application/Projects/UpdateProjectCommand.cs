using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class UpdateProjectCommandHandler : ICommandHandler<UpdateProjectCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateProjectCommandHandler(
        IProjectRepository projectRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(UpdateProjectCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var project = await _projectRepository.GetByIdAsync(command.Id, cancellationToken);

            if (project == null)
            {
                return Result.Failure(
                    new Error("ProjectNotFound", $"Project with ID {command.Id} was not found."));
            }

            // Check if another project with the same name already exists
            var existingProject = await _projectRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingProject != null && existingProject.Id != command.Id)
            {
                return Result.Failure(
                    new Error("ProjectAlreadyExists", $"A project with the name '{command.Name}' already exists."));
            }

            // Update the project using domain method
            project.Update(command.Name, command.Description, _dateTimeProvider.UtcNow);

            await _projectRepository.UpdateAsync(project, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("ProjectUpdateFailed", ex.Message));
        }
    }
}

public record UpdateProjectCommand(int Id, string Name, string? Description) : ICommand;
