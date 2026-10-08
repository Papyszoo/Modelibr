using Domain.Models;
using Domain.Projects;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Narrows a project's comments. A null field does not filter; a set target id keeps only
/// the comments about that one thing.
/// </summary>
public sealed record ProjectCommentFilter(
    ProjectCommentTarget? Target = null,
    bool? IsPinned = null,
    string? Status = null);

public interface IProjectCommentRepository
{
    Task<ProjectComment> AddAsync(ProjectComment comment, CancellationToken cancellationToken = default);
    Task<ProjectComment?> GetByIdAsync(int projectId, int commentId, CancellationToken cancellationToken = default);
    Task<IEnumerable<ProjectComment>> GetForProjectAsync(
        int projectId,
        ProjectCommentFilter filter,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether the one thing <paramref name="target"/> names exists: a level, reference
    /// image or character owned by <paramref name="projectId"/>, or a library asset.
    /// An empty target trivially exists.
    /// </summary>
    Task<bool> TargetExistsAsync(int projectId, ProjectCommentTarget target, CancellationToken cancellationToken = default);

    Task UpdateAsync(ProjectComment comment, CancellationToken cancellationToken = default);
    Task DeleteAsync(ProjectComment comment, CancellationToken cancellationToken = default);
}
