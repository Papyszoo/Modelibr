namespace Domain.Models;

/// <summary>
/// Links one project reference image to a production target. A single image can be
/// linked to many levels and many characters; each link row carries exactly one target.
/// </summary>
public class ProjectReferenceLink
{
    public const string LevelTarget = "level";
    public const string CharacterTarget = "character";

    public int Id { get; private set; }
    public int ProjectId { get; private set; }
    public int ProjectConceptImageId { get; private set; }
    public int? ProjectLevelId { get; private set; }
    public int? ProjectCharacterId { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public ProjectConceptImage ReferenceImage { get; private set; } = null!;
    public ProjectLevel? ProjectLevel { get; private set; }
    public ProjectCharacter? ProjectCharacter { get; private set; }

    /// <summary>Derived discriminator for API payloads; never persisted.</summary>
    public string TargetType => ProjectLevelId.HasValue ? LevelTarget : CharacterTarget;

    public static ProjectReferenceLink Create(
        int projectId,
        int referenceImageId,
        int? projectLevelId,
        int? projectCharacterId,
        DateTime createdAt)
    {
        if (projectId <= 0)
            throw new ArgumentException("Project ID must be greater than 0.", nameof(projectId));
        if (referenceImageId <= 0)
            throw new ArgumentException("Reference image ID must be greater than 0.", nameof(referenceImageId));
        if (projectLevelId is <= 0)
            throw new ArgumentException("Project level ID must be greater than 0 when supplied.", nameof(projectLevelId));
        if (projectCharacterId is <= 0)
            throw new ArgumentException("Project character ID must be greater than 0 when supplied.", nameof(projectCharacterId));
        if (new[] { projectLevelId, projectCharacterId }.Count(id => id.HasValue) != 1)
            throw new ArgumentException(
                "A reference link must target exactly one level or one character.",
                nameof(projectLevelId));

        return new ProjectReferenceLink
        {
            ProjectId = projectId,
            ProjectConceptImageId = referenceImageId,
            ProjectLevelId = projectLevelId,
            ProjectCharacterId = projectCharacterId,
            CreatedAt = createdAt
        };
    }

    public bool TargetsLevel(int levelId) => ProjectLevelId == levelId;

    public bool TargetsCharacter(int characterId) => ProjectCharacterId == characterId;
}
