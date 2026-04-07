using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

internal sealed class AddProjectConceptImageCommandHandler : ICommandHandler<AddProjectConceptImageCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddProjectConceptImageCommandHandler(
        IProjectRepository projectRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AddProjectConceptImageCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
        {
            return Result.Failure(new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
        if (file == null)
        {
            return Result.Failure(new Error("FileNotFound", $"File with ID {command.FileId} was not found."));
        }

        project.AddConceptImage(file, _dateTimeProvider.UtcNow);
        await _projectRepository.UpdateAsync(project, cancellationToken);
        return Result.Success();
    }
}

internal sealed class RemoveProjectConceptImageCommandHandler : ICommandHandler<RemoveProjectConceptImageCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RemoveProjectConceptImageCommandHandler(
        IProjectRepository projectRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(RemoveProjectConceptImageCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
        {
            return Result.Failure(new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
        }

        project.RemoveConceptImage(command.FileId, _dateTimeProvider.UtcNow);
        await _projectRepository.UpdateAsync(project, cancellationToken);
        return Result.Success();
    }
}

internal sealed class SetProjectCustomThumbnailCommandHandler : ICommandHandler<SetProjectCustomThumbnailCommand>
{
    private readonly IProjectRepository _projectRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetProjectCustomThumbnailCommandHandler(
        IProjectRepository projectRepository,
        IFileRepository fileRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _projectRepository = projectRepository;
        _fileRepository = fileRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SetProjectCustomThumbnailCommand command, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(command.ProjectId, cancellationToken);
        if (project == null)
        {
            return Result.Failure(new Error("ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));
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

        project.SetCustomThumbnail(file, _dateTimeProvider.UtcNow);
        await _projectRepository.UpdateAsync(project, cancellationToken);
        return Result.Success();
    }
}

public record AddProjectConceptImageCommand(int ProjectId, int FileId) : ICommand;
public record RemoveProjectConceptImageCommand(int ProjectId, int FileId) : ICommand;
public record SetProjectCustomThumbnailCommand(int ProjectId, int? FileId) : ICommand;