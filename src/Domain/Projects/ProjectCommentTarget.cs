namespace Domain.Projects;

/// <summary>
/// What a project comment is about: nothing (the project itself) or exactly one level,
/// reference image, character, or library asset. Every id is optional; more than one set
/// is the conflict <see cref="Models.ProjectComment"/> refuses.
/// </summary>
public sealed record ProjectCommentTarget(
    int? LevelId = null,
    int? ReferenceImageId = null,
    int? CharacterId = null,
    int? ModelId = null,
    int? TextureSetId = null,
    int? SpriteId = null,
    int? SoundId = null,
    int? EnvironmentMapId = null,
    int? VfxId = null)
{
    public static ProjectCommentTarget None { get; } = new();

    /// <summary>Each target kind with its id, in a fixed order, for validation and messages.</summary>
    public IReadOnlyList<(string Kind, int? Id)> Entries =>
    [
        ("Level", LevelId),
        ("Reference image", ReferenceImageId),
        ("Character", CharacterId),
        ("Model", ModelId),
        ("Texture set", TextureSetId),
        ("Sprite", SpriteId),
        ("Sound", SoundId),
        ("Environment map", EnvironmentMapId),
        ("VFX", VfxId),
    ];

    public int Count => Entries.Count(entry => entry.Id.HasValue);
}
