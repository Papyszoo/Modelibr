using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Projects;
using SharedKernel;

namespace Application.Projects;

/// <summary>
/// A project's comments, pinned (decisions) first, then most recently updated.
/// <paramref name="Status"/> is <c>open</c> or <c>resolved</c>; null returns both.
/// </summary>
public sealed record GetProjectCommentsQuery(
    int ProjectId,
    ProjectCommentTarget? Target = null,
    bool? IsPinned = null,
    string? Status = null) : IQuery<IReadOnlyList<ProjectCommentDto>>;

internal sealed class GetProjectCommentsQueryHandler
    : IQueryHandler<GetProjectCommentsQuery, IReadOnlyList<ProjectCommentDto>>
{
    private readonly IProjectCommentRepository _comments;

    public GetProjectCommentsQueryHandler(IProjectCommentRepository comments)
    {
        _comments = comments;
    }

    public async Task<Result<IReadOnlyList<ProjectCommentDto>>> Handle(
        GetProjectCommentsQuery query,
        CancellationToken cancellationToken)
    {
        string? status = null;
        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            try
            {
                status = ProjectCommentStatuses.Normalize(query.Status);
            }
            catch (ArgumentException exception)
            {
                return Result.Failure<IReadOnlyList<ProjectCommentDto>>(
                    new Error("InvalidProjectCommentStatus", exception.Message));
            }
        }

        var comments = await _comments.GetForProjectAsync(
            query.ProjectId,
            new ProjectCommentFilter(query.Target, query.IsPinned, status),
            cancellationToken);
        return Result.Success<IReadOnlyList<ProjectCommentDto>>(comments
            .Select(ProjectCommentView.From)
            .ToList());
    }
}

public sealed record GetProjectCommentByIdQuery(int ProjectId, int CommentId)
    : IQuery<ProjectCommentDto>;

internal sealed class GetProjectCommentByIdQueryHandler
    : IQueryHandler<GetProjectCommentByIdQuery, ProjectCommentDto>
{
    private readonly IProjectCommentRepository _comments;

    public GetProjectCommentByIdQueryHandler(IProjectCommentRepository comments)
    {
        _comments = comments;
    }

    public async Task<Result<ProjectCommentDto>> Handle(
        GetProjectCommentByIdQuery query,
        CancellationToken cancellationToken)
    {
        var comment = await _comments.GetByIdAsync(query.ProjectId, query.CommentId, cancellationToken);
        return comment is null
            ? Result.Failure<ProjectCommentDto>(ProjectCommentView.NotFound(query.ProjectId, query.CommentId))
            : Result.Success(ProjectCommentView.From(comment));
    }
}
