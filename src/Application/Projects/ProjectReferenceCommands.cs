using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

public sealed record ProjectReferenceDto(
    int Id,
    int ProjectId,
    int? ProjectLevelId,
    string Title,
    int FileId,
    string FileName,
    string PreviewUrl,
    string FileUrl,
    int SortOrder);

public sealed record UpdateProjectReferenceCommand(
    int ProjectId,
    int ReferenceId,
    string? Title,
    int? ProjectLevelId) : ICommand<ProjectReferenceDto>;

internal sealed class UpdateProjectReferenceCommandHandler
    : ICommandHandler<UpdateProjectReferenceCommand, ProjectReferenceDto>
{
    private readonly IProjectLevelRepository _levels;
    private readonly IProjectReferenceRepository _references;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectReferenceCommandHandler(
        IProjectLevelRepository levels,
        IProjectReferenceRepository references,
        IUnitOfWork unitOfWork)
    {
        _levels = levels;
        _references = references;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectReferenceDto>> Handle(
        UpdateProjectReferenceCommand command,
        CancellationToken cancellationToken)
    {
        var reference = await _references.GetByIdAsync(
            command.ProjectId,
            command.ReferenceId,
            cancellationToken);
        if (reference is null)
            return Result.Failure<ProjectReferenceDto>(new Error(
                "ProjectReferenceNotFound",
                $"Reference image {command.ReferenceId} was not found in project {command.ProjectId}."));

        if (command.ProjectLevelId is { } levelId
            && await _levels.GetByIdAsync(command.ProjectId, levelId, cancellationToken) is null)
            return Result.Failure<ProjectReferenceDto>(new Error(
                "ProjectReferenceLevelNotFound",
                $"Level {levelId} was not found in project {command.ProjectId}."));

        try
        {
            reference.UpdateDetails(command.Title, command.ProjectLevelId);
            await _references.UpdateAsync(reference, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectReferenceView.From(reference));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectReferenceDto>(
                new Error("InvalidProjectReference", exception.Message));
        }
    }
}

internal static class ProjectReferenceView
{
    public static ProjectReferenceDto From(ProjectConceptImage reference) => new(
        reference.Id,
        reference.ProjectId,
        reference.ProjectLevelId,
        reference.Title,
        reference.FileId,
        reference.File.OriginalFileName,
        $"/files/{reference.FileId}/preview?channel=rgb",
        $"/files/{reference.FileId}",
        reference.SortOrder);
}
