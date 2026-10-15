using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using SharedKernel;

namespace Application.Projects;

public sealed record ProjectCommentDto(
    int Id,
    int ProjectId,
    int? LevelId,
    int? ReferenceImageId,
    int? CharacterId,
    int? ModelId,
    int? TextureSetId,
    int? SpriteId,
    int? SoundId,
    int? EnvironmentMapId,
    int? VfxId,
    string Title,
    string Body,
    bool IsPinned,
    string Status,
    string? Resolution,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public ProjectCommentTarget ToTarget() => new(
        LevelId, ReferenceImageId, CharacterId, ModelId, TextureSetId,
        SpriteId, SoundId, EnvironmentMapId, VfxId);
}

public sealed record CreateProjectCommentCommand(
    int ProjectId,
    ProjectCommentTarget Target,
    string Title,
    string Body,
    bool IsPinned) : ICommand<ProjectCommentDto>;

/// <summary>
/// Replaces a comment's content and target. <paramref name="Status"/> null keeps the
/// current status and resolution; a status sets both, so resolving with no resolution
/// text records none.
/// </summary>
public sealed record UpdateProjectCommentCommand(
    int ProjectId,
    int CommentId,
    ProjectCommentTarget Target,
    string Title,
    string Body,
    bool IsPinned,
    string? Status = null,
    string? Resolution = null) : ICommand<ProjectCommentDto>;

public sealed record DeleteProjectCommentCommand(int ProjectId, int CommentId) : ICommand;

internal sealed class CreateProjectCommentCommandHandler
    : ICommandHandler<CreateProjectCommentCommand, ProjectCommentDto>
{
    private readonly IProjectRepository _projects;
    private readonly IProjectCommentRepository _comments;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public CreateProjectCommentCommandHandler(
        IProjectRepository projects,
        IProjectCommentRepository comments,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _projects = projects;
        _comments = comments;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCommentDto>> Handle(
        CreateProjectCommentCommand command,
        CancellationToken cancellationToken)
    {
        if (await _projects.GetByIdAsync(command.ProjectId, cancellationToken) is null)
            return Result.Failure<ProjectCommentDto>(new Error(
                "ProjectNotFound", $"Project with ID {command.ProjectId} was not found."));

        var targetError = await ProjectCommentTargetGuard.ValidateAsync(
            command.ProjectId, command.Target, _comments, cancellationToken);
        if (targetError is not null)
            return Result.Failure<ProjectCommentDto>(targetError);

        try
        {
            var comment = ProjectComment.Create(
                command.ProjectId,
                command.Target,
                command.Title,
                command.Body,
                command.IsPinned,
                _clock.UtcNow);
            await _comments.AddAsync(comment, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCommentView.From(comment));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCommentDto>(
                new Error("InvalidProjectComment", exception.Message));
        }
    }
}

internal sealed class UpdateProjectCommentCommandHandler
    : ICommandHandler<UpdateProjectCommentCommand, ProjectCommentDto>
{
    private readonly IProjectCommentRepository _comments;
    private readonly IDateTimeProvider _clock;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProjectCommentCommandHandler(
        IProjectCommentRepository comments,
        IDateTimeProvider clock,
        IUnitOfWork unitOfWork)
    {
        _comments = comments;
        _clock = clock;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<ProjectCommentDto>> Handle(
        UpdateProjectCommentCommand command,
        CancellationToken cancellationToken)
    {
        var comment = await _comments.GetByIdAsync(command.ProjectId, command.CommentId, cancellationToken);
        if (comment is null)
            return Result.Failure<ProjectCommentDto>(ProjectCommentView.NotFound(command.ProjectId, command.CommentId));

        var targetError = await ProjectCommentTargetGuard.ValidateAsync(
            command.ProjectId, command.Target, _comments, cancellationToken);
        if (targetError is not null)
            return Result.Failure<ProjectCommentDto>(targetError);

        try
        {
            var now = _clock.UtcNow;
            comment.Update(command.Target, command.Title, command.Body, command.IsPinned, now);
            if (command.Status is not null)
                comment.SetStatus(command.Status, command.Resolution, now);

            await _comments.UpdateAsync(comment, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return Result.Success(ProjectCommentView.From(comment));
        }
        catch (ArgumentException exception)
        {
            return Result.Failure<ProjectCommentDto>(
                new Error("InvalidProjectComment", exception.Message));
        }
    }
}

internal sealed class DeleteProjectCommentCommandHandler
    : ICommandHandler<DeleteProjectCommentCommand>
{
    private readonly IProjectCommentRepository _comments;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteProjectCommentCommandHandler(
        IProjectCommentRepository comments,
        IUnitOfWork unitOfWork)
    {
        _comments = comments;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(
        DeleteProjectCommentCommand command,
        CancellationToken cancellationToken)
    {
        var comment = await _comments.GetByIdAsync(command.ProjectId, command.CommentId, cancellationToken);
        if (comment is null)
            return Result.Failure(ProjectCommentView.NotFound(command.ProjectId, command.CommentId));

        await _comments.DeleteAsync(comment, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

internal static class ProjectCommentView
{
    public static ProjectCommentDto From(ProjectComment comment) => new(
        comment.Id,
        comment.ProjectId,
        comment.LevelId,
        comment.ReferenceImageId,
        comment.CharacterId,
        comment.ModelId,
        comment.TextureSetId,
        comment.SpriteId,
        comment.SoundId,
        comment.EnvironmentMapId,
        comment.VfxId,
        comment.Title,
        comment.Body,
        comment.IsPinned,
        comment.Status,
        comment.Resolution,
        comment.CreatedAt,
        comment.UpdatedAt);

    public static Error NotFound(int projectId, int commentId) => new(
        "ProjectCommentNotFound",
        $"Comment {commentId} was not found in project {projectId}.");
}

internal static class ProjectCommentTargetGuard
{
    public static async Task<Error?> ValidateAsync(
        int projectId,
        ProjectCommentTarget target,
        IProjectCommentRepository comments,
        CancellationToken cancellationToken)
    {
        if (target.Count > 1)
            return new Error(
                "ProjectCommentTargetConflict",
                "A comment can target only one level, reference image, character, or asset.");

        if (target.Count == 0 || await comments.TargetExistsAsync(projectId, target, cancellationToken))
            return null;

        var (kind, id) = target.Entries.First(entry => entry.Id.HasValue);
        // Levels, references and characters belong to one project; library assets do not.
        var scope = target.LevelId.HasValue || target.ReferenceImageId.HasValue || target.CharacterId.HasValue
            ? $" in project {projectId}"
            : string.Empty;
        return new Error("ProjectCommentTargetNotFound", $"{kind} {id} was not found{scope}.");
    }
}
