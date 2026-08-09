namespace Domain.Models;

/// <summary>
/// Links a <see cref="ModelVersion"/> to an auxiliary <see cref="File"/> — an external
/// glTF buffer (<c>.bin</c>) or texture — together with the <see cref="RelativePath"/>
/// exactly as the primary <c>.gltf</c> references it (e.g. <c>scene.bin</c>,
/// <c>textures/wood.png</c>).
///
/// The relative path lives on this join and NOT on <see cref="File"/> because File rows
/// are content-addressed and shared across models: the same bytes can be cited at
/// different URIs in different groups. Keeping aux files out of
/// <see cref="ModelVersion.Files"/> (the renderable-file set) means primary-file
/// selection and file listings are unaffected — the worker's glTF loader resolves the
/// primary's external URIs against these rows.
/// </summary>
public class ModelVersionAuxiliaryFile
{
    public int Id { get; private set; }
    public int ModelVersionId { get; private set; }
    public int FileId { get; private set; }

    /// <summary>The URI as the primary glTF references it (e.g. "scene.bin", "textures/wood.png").</summary>
    public string RelativePath { get; private set; } = string.Empty;

    public DateTime CreatedAt { get; private set; }

    // Navigation properties. File is set explicitly so EF wires FileId and cascade-inserts
    // a newly created (detached) aux file or links an already-tracked existing one.
    public ModelVersion ModelVersion { get; set; } = null!;
    public File File { get; set; } = null!;

    /// <summary>
    /// Creates an auxiliary-file link for a version. Pass the <paramref name="file"/>
    /// entity (new or existing) as the navigation so persistence works for both cases.
    /// </summary>
    public static ModelVersionAuxiliaryFile Create(
        int modelVersionId,
        File file,
        string relativePath,
        DateTime createdAt)
    {
        if (modelVersionId <= 0)
            throw new ArgumentException("Model version id must be greater than 0.", nameof(modelVersionId));
        if (file is null)
            throw new ArgumentNullException(nameof(file));

        var normalizedPath = NormalizeRelativePath(relativePath);
        if (string.IsNullOrWhiteSpace(normalizedPath))
            throw new ArgumentException("Relative path cannot be null or whitespace.", nameof(relativePath));
        if (normalizedPath.Length > 500)
            throw new ArgumentException("Relative path cannot exceed 500 characters.", nameof(relativePath));

        return new ModelVersionAuxiliaryFile
        {
            ModelVersionId = modelVersionId,
            File = file,
            RelativePath = normalizedPath,
            CreatedAt = createdAt
        };
    }

    /// <summary>
    /// Normalizes a relative path to the forward-slash, no-leading-slash form glTF URIs
    /// use, so it matches how the loader requests sub-resources regardless of the OS or
    /// archive that produced it. Rejects path traversal.
    /// </summary>
    public static string NormalizeRelativePath(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
            return string.Empty;

        var normalized = relativePath.Trim().Replace('\\', '/');

        // Collapse any leading "./" and strip a leading slash.
        while (normalized.StartsWith("./", StringComparison.Ordinal))
            normalized = normalized[2..];
        normalized = normalized.TrimStart('/');

        // Reject traversal — aux paths are resolved against uploaded siblings only.
        if (normalized.Split('/').Any(segment => segment == ".."))
            throw new ArgumentException("Relative path cannot contain '..' segments.", nameof(relativePath));

        return normalized;
    }
}
