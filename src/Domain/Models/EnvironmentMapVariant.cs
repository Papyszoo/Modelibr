namespace Domain.Models;

public class EnvironmentMapVariant
{
    private static readonly EnvironmentMapCubeFace[] RequiredCubeFaces =
    [
        EnvironmentMapCubeFace.Px,
        EnvironmentMapCubeFace.Nx,
        EnvironmentMapCubeFace.Py,
        EnvironmentMapCubeFace.Ny,
        EnvironmentMapCubeFace.Pz,
        EnvironmentMapCubeFace.Nz
    ];

    private readonly List<EnvironmentMapVariantFaceFile> _faceFiles = new();

    public int Id { get; private set; }
    public int EnvironmentMapId { get; internal set; }
    public int? FileId { get; private set; }
    public EnvironmentMapProjectionType ProjectionType { get; private set; }
    public string SizeLabel { get; private set; } = string.Empty;
    public string? ThumbnailPath { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    public File? File { get; private set; }

    public ICollection<EnvironmentMapVariantFaceFile> FaceFiles
    {
        get => _faceFiles;
        set
        {
            _faceFiles.Clear();
            if (value != null)
                _faceFiles.AddRange(value);
        }
    }

    public static EnvironmentMapVariant Create(File file, string sizeLabel, DateTime createdAt)
        => CreatePanoramic(file, sizeLabel, createdAt);

    public static EnvironmentMapVariant CreatePanoramic(File file, string sizeLabel, DateTime createdAt)
    {
        ArgumentNullException.ThrowIfNull(file);
        ValidateSizeLabel(sizeLabel);

        return new EnvironmentMapVariant
        {
            FileId = file.Id,
            File = file,
            ProjectionType = EnvironmentMapProjectionType.Panoramic,
            SizeLabel = sizeLabel.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    public static EnvironmentMapVariant CreateCube(IReadOnlyDictionary<EnvironmentMapCubeFace, File> faceFiles, string sizeLabel, DateTime createdAt)
    {
        ArgumentNullException.ThrowIfNull(faceFiles);
        ValidateSizeLabel(sizeLabel);
        ValidateCubeFaces(faceFiles);

        var variant = new EnvironmentMapVariant
        {
            ProjectionType = EnvironmentMapProjectionType.Cube,
            SizeLabel = sizeLabel.Trim(),
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };

        foreach (var face in RequiredCubeFaces)
            variant._faceFiles.Add(EnvironmentMapVariantFaceFile.Create(face, faceFiles[face]));

        return variant;
    }

    public void UpdateSizeLabel(string sizeLabel, DateTime updatedAt)
    {
        ValidateSizeLabel(sizeLabel);

        SizeLabel = sizeLabel.Trim();
        UpdatedAt = updatedAt;
    }

    public void SetThumbnailPath(string? thumbnailPath, DateTime updatedAt)
    {
        if (thumbnailPath != null && string.IsNullOrWhiteSpace(thumbnailPath))
            throw new ArgumentException("Thumbnail path cannot be empty when provided.", nameof(thumbnailPath));

        ThumbnailPath = thumbnailPath?.Trim();
        UpdatedAt = updatedAt;
    }

    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }

    public bool IsPanoramic => ProjectionType == EnvironmentMapProjectionType.Panoramic;
    public bool IsCube => ProjectionType == EnvironmentMapProjectionType.Cube;

    public File? GetPreviewFile()
    {
        if (IsPanoramic)
            return File;

        return GetFaceFile(EnvironmentMapCubeFace.Pz)
            ?? RequiredCubeFaces.Select(GetFaceFile).FirstOrDefault(f => f != null);
    }

    public File? GetFaceFile(EnvironmentMapCubeFace face)
        => _faceFiles.FirstOrDefault(f => f.Face == face)?.File;

    public IReadOnlyList<EnvironmentMapVariantFaceFile> GetOrderedFaceFiles()
    {
        return _faceFiles
            .OrderBy(f => Array.IndexOf(RequiredCubeFaces, f.Face))
            .ToList()
            .AsReadOnly();
    }

    private static void ValidateSizeLabel(string sizeLabel)
    {
        if (string.IsNullOrWhiteSpace(sizeLabel))
            throw new ArgumentException("Variant size label cannot be null or empty.", nameof(sizeLabel));

        if (sizeLabel.Length > 50)
            throw new ArgumentException("Variant size label cannot exceed 50 characters.", nameof(sizeLabel));
    }

    private static void ValidateCubeFaces(IReadOnlyDictionary<EnvironmentMapCubeFace, File> faceFiles)
    {
        if (faceFiles.Count != RequiredCubeFaces.Length)
            throw new ArgumentException("Cube variants must provide exactly six faces.", nameof(faceFiles));

        foreach (var face in RequiredCubeFaces)
        {
            if (!faceFiles.ContainsKey(face))
                throw new ArgumentException($"Cube variants must provide the '{face}' face.", nameof(faceFiles));

            ArgumentNullException.ThrowIfNull(faceFiles[face]);
        }
    }
}
