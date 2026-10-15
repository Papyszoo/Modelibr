using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

public sealed record ProjectLevelDto(
    int Id,
    int ProjectId,
    string Name,
    string? Description,
    string ProductionStatus,
    int SortOrder,
    IReadOnlyList<string> CharacterVariantNames,
    int CharacterVariantCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record CreateProjectLevelCommand(
    int ProjectId,
    string Name,
    string? Description,
    string? ProductionStatus,
    int? SortOrder) : ICommand<ProjectLevelDto>;

public sealed record UpdateProjectLevelCommand(
    int ProjectId,
    int LevelId,
    string Name,
    string? Description,
    string? ProductionStatus,
    int? SortOrder) : ICommand<ProjectLevelDto>;

public sealed record DeleteProjectLevelCommand(int ProjectId, int LevelId) : ICommand;

internal sealed class CreateProjectLevelCommandHandler
    : ICommandHandler<CreateProjectLevelCommand, ProjectLevelDto>
{
    private readonly IProjectRepository _projects;
    private readonly IProjectLevelRepository _levels;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public CreateProjectLevelCommandHandler(
        IProjectRepository projects,
        IProjectLevelRepository levels,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _projects = projects;
        _levels = levels;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectLevelDto>> Handle(
        CreateProjectLevelCommand command,
        CancellationToken cancellationToken)
    {
        if (await _projects.GetByIdAsync(command.ProjectId, cancellationToken) is null)
            return Result.Failure<ProjectLevelDto>(new Error(
                "ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        if (await _levels.NameExistsAsync(command.ProjectId, command.Name, cancellationToken: cancellationToken))
            return Result.Failure<ProjectLevelDto>(new Error(
                "ProjectLevelNameAlreadyExists",
                $"A level named '{command.Name.Trim()}' already exists in this project."));

        try
        {
            var level = ProjectLevel.Create(
                command.ProjectId,
                command.Name,
                command.Description,
                command.ProductionStatus ?? ProjectLevelStatuses.Planned,
                command.SortOrder ?? await _levels.GetNextSortOrderAsync(
                    command.ProjectId,
                    cancellationToken),
                _clock.UtcNow);
            await _levels.AddAsync(level, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectLevelView.From(level));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectLevelDto>(
                new Error("InvalidProjectLevel", exception.Message));
        }
    }
}

internal sealed class UpdateProjectLevelCommandHandler
    : ICommandHandler<UpdateProjectLevelCommand, ProjectLevelDto>
{
    private readonly IProjectLevelRepository _levels;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectLevelCommandHandler(
        IProjectLevelRepository levels,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _levels = levels;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectLevelDto>> Handle(
        UpdateProjectLevelCommand command,
        CancellationToken cancellationToken)
    {
        var level = await _levels.GetByIdAsync(command.ProjectId, command.LevelId, cancellationToken);
        if (level is null)
            return Result.Failure<ProjectLevelDto>(new Error(
                "ProjectLevelNotFound",
                $"Level {command.LevelId} was not found in project {command.ProjectId}."));

        if (await _levels.NameExistsAsync(
                command.ProjectId,
                command.Name,
                command.LevelId,
                cancellationToken))
            return Result.Failure<ProjectLevelDto>(new Error(
                "ProjectLevelNameAlreadyExists",
                $"A level named '{command.Name.Trim()}' already exists in this project."));

        try
        {
            level.Update(
                command.Name,
                command.Description,
                command.ProductionStatus ?? level.ProductionStatus,
                command.SortOrder ?? level.SortOrder,
                _clock.UtcNow);
            await _levels.UpdateAsync(level, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectLevelView.From(level));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectLevelDto>(
                new Error("InvalidProjectLevel", exception.Message));
        }
    }
}

internal sealed class DeleteProjectLevelCommandHandler
    : ICommandHandler<DeleteProjectLevelCommand>
{
    private readonly IProjectLevelRepository _levels;
    private readonly ISceneRepository _scenes;
    private readonly IProjectReferenceRepository _references;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteProjectLevelCommandHandler(
        IProjectLevelRepository levels,
        ISceneRepository scenes,
        IProjectReferenceRepository references,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _levels = levels;
        _scenes = scenes;
        _references = references;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        DeleteProjectLevelCommand command,
        CancellationToken cancellationToken)
    {
        // The level's scenes keep existing, but the FK that clears their ProjectLevelId
        // is SET NULL, and a scene left primary with no level violates
        // CK_Scenes_PrimaryLevelRequiresLevel. Clear the link (and the primary flag)
        // and commit it BEFORE the level row goes - see DeleteProjectCommandHandler for
        // why the two saves are split.
        var tx = await _unitOfWork.InTransactionAsync<bool>(async ct =>
        {
            var level = await _levels.GetByIdAsync(command.ProjectId, command.LevelId, ct);
            if (level is null)
            {
                return Result.Failure<bool>(new Error(
                    "ProjectLevelNotFound",
                    $"Level {command.LevelId} was not found in project {command.ProjectId}."));
            }

            var now = _clock.UtcNow;
            var scenes = await _scenes.GetByLevelsAsync(new[] { level.Id }, ct);
            foreach (var scene in scenes)
            {
                scene.SetLevel(null, false, now);
            }
            await _unitOfWork.SaveChangesAsync(ct);

            // Reference images stay, their link to this level goes. The FK is SET NULL, so
            // leaving the rows would leave a link with no target - which the
            // CK_ProjectReferenceLinks_OneTarget check refuses, turning the delete into a 500.
            await _references.DeleteLinksForLevelAsync(level.ProjectId, level.Id, ct);

            await _levels.DeleteAsync(level, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result.Success(true);
        }, cancellationToken);

        return tx.IsFailure ? Result.Failure(tx.Error) : Result.Success();
    }
}

internal static class ProjectLevelView
{
    public static ProjectLevelDto From(ProjectLevel level) => new(
        level.Id,
        level.ProjectId,
        level.Name,
        level.Description,
        level.ProductionStatus,
        level.SortOrder,
        level.CharacterVariants
            .OrderBy(variant => variant.SortOrder)
            .ThenBy(variant => variant.Id)
            .Select(variant => variant.Name)
            .ToList(),
        level.CharacterVariants.Count,
        level.CreatedAt,
        level.UpdatedAt);
}
