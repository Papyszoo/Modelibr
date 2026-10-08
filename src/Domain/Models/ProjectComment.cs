using Domain.Projects;

namespace Domain.Models;

/// <summary>
/// A comment on a project, or on one level, reference image, character, or library asset
/// in it. Open until someone resolves it, optionally with a short resolution saying what
/// changed; a resolved comment can be reopened. A pinned comment is a project decision.
/// </summary>
/// <remarks>Stored in the <c>ProductionNotes</c> table, the name it had before comments had a status.</remarks>
public class ProjectComment : AggregateRoot
{
    public const int MaxResolutionLength = 2000;

    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int? LevelId { get; private set; }
    public int? ReferenceImageId { get; private set; }
    public int? CharacterId { get; private set; }
    public int? ModelId { get; private set; }
    public int? TextureSetId { get; private set; }
    public int? SpriteId { get; private set; }
    public int? SoundId { get; private set; }
    public int? EnvironmentMapId { get; private set; }
    public int? VfxId { get; private set; }
    public string Title { get; private set; } = string.Empty;
    public string Body { get; private set; } = string.Empty;
    public bool IsPinned { get; private set; }
    public string Status { get; private set; } = ProjectCommentStatuses.Open;
    public string? Resolution { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public Project Project { get; private set; } = null!;
    public ProjectLevel? Level { get; private set; }
    public ProjectConceptImage? ReferenceImage { get; private set; }
    public ProjectCharacter? Character { get; private set; }

    public ProjectCommentTarget Target => new(
        LevelId, ReferenceImageId, CharacterId, ModelId, TextureSetId,
        SpriteId, SoundId, EnvironmentMapId, VfxId);

    public static ProjectComment Create(
        int projectId,
        ProjectCommentTarget target,
        string title,
        string body,
        bool isPinned,
        DateTime now)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));

        var comment = new ProjectComment
        {
            ProjectId = projectId,
            Status = ProjectCommentStatuses.Open,
            CreatedAt = now,
            UpdatedAt = now
        };
        comment.Update(target, title, body, isPinned, now);
        return comment;
    }

    public void Update(
        ProjectCommentTarget target,
        string title,
        string body,
        bool isPinned,
        DateTime updatedAt)
    {
        ArgumentNullException.ThrowIfNull(target);
        foreach (var (kind, id) in target.Entries)
        {
            if (id is <= 0)
                throw new ArgumentException($"{kind} ID must be greater than 0 when supplied.", nameof(target));
        }
        if (target.Count > 1)
            throw new ArgumentException("A comment can target only one level, reference image, character, or asset.", nameof(target));
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("Comment title is required.", nameof(title));
        if (title.Trim().Length > 200)
            throw new ArgumentException("Comment title cannot exceed 200 characters.", nameof(title));
        if (string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Comment body is required.", nameof(body));
        if (body.Trim().Length > 10_000)
            throw new ArgumentException("Comment body cannot exceed 10000 characters.", nameof(body));

        LevelId = target.LevelId;
        ReferenceImageId = target.ReferenceImageId;
        CharacterId = target.CharacterId;
        ModelId = target.ModelId;
        TextureSetId = target.TextureSetId;
        SpriteId = target.SpriteId;
        SoundId = target.SoundId;
        EnvironmentMapId = target.EnvironmentMapId;
        VfxId = target.VfxId;
        Title = title.Trim();
        Body = body.Trim();
        IsPinned = isPinned;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Opens or resolves the comment. A resolution belongs only to a resolved comment:
    /// reopening clears it, because it no longer describes the comment's state.
    /// </summary>
    public void SetStatus(string status, string? resolution, DateTime updatedAt)
    {
        var normalized = ProjectCommentStatuses.Normalize(status);
        var trimmed = string.IsNullOrWhiteSpace(resolution) ? null : resolution.Trim();

        if (normalized == ProjectCommentStatuses.Open && trimmed is not null)
            throw new ArgumentException("A resolution can only be recorded on a resolved comment.", nameof(resolution));
        if (trimmed is { Length: > MaxResolutionLength })
            throw new ArgumentException($"Comment resolution cannot exceed {MaxResolutionLength} characters.", nameof(resolution));

        Status = normalized;
        Resolution = trimmed;
        UpdatedAt = updatedAt;
    }
}
