using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal class CreateProjectCommandHandler : ICommandHandler<CreateProjectCommand, CreateProjectResponse>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateProjectCommandHandler(
        IProjectRepository projectRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateProjectResponse>> Handle(CreateProjectCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Check if a project with the same name already exists
            var existingProject = await _projectRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingProject != null)
            {
                return Result.Failure<CreateProjectResponse>(
                    new Error("ProjectAlreadyExists", $"A project with the name '{command.Name}' already exists."));
            }

            // Create new project using domain factory method
            var project = Project.Create(command.Name, command.Description, _dateTimeProvider.UtcNow);

            var savedProject = await _projectRepository.AddAsync(project, cancellationToken);

            return Result.Success(new CreateProjectResponse(savedProject.Id, savedProject.Name, savedProject.Description));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateProjectResponse>(
                new Error("ProjectCreationFailed", ex.Message));
        }
    }
}

public record CreateProjectCommand(string Name, string? Description) : ICommand<CreateProjectResponse>;
public record CreateProjectResponse(int Id, string Name, string? Description);
