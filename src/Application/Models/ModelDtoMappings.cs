using Domain.Models;
using Domain.ValueObjects;

namespace Application.Models;

internal static class ModelDtoMappings
{
    public static IReadOnlyList<string> ToTagNames(IEnumerable<ModelTag> tags)
    {
        return tags
            .Select(tag => tag.Name)
            .OrderBy(name => name)
            .ToArray();
    }

    public static ModelConceptImageDto ToConceptImageDto(ModelConceptImage conceptImage)
    {
        return new ModelConceptImageDto
        {
            FileId = conceptImage.FileId,
            FileName = conceptImage.File.OriginalFileName,
            PreviewUrl = $"/files/{conceptImage.FileId}/preview?channel=rgb",
            FileUrl = $"/files/{conceptImage.FileId}",
            SortOrder = conceptImage.SortOrder,
            MimeType = conceptImage.File.MimeType
        };
    }

    public static string? BuildCategoryPath(ModelCategory? category)
    {
        if (category == null)
            return null;

        var segments = new Stack<string>();
        var current = category;
        while (current != null)
        {
            segments.Push(current.Name);
            current = current.Parent;
        }

        return string.Join(" / ", segments);
    }

    public static ModelTechnicalMetadataDto ToTechnicalMetadataDto(
        ModelVersion? version,
        ModelAnimationMetadata? animationMetadata = null)
    {
        return new ModelTechnicalMetadataDto
        {
            LatestVersionId = version?.Id,
            LatestVersionNumber = version?.VersionNumber,
            TriangleCount = version?.TriangleCount,
            VertexCount = version?.VertexCount,
            MeshCount = version?.MeshCount,
            MaterialCount = version?.MaterialCount,
            BoundingBoxX = version?.BoundingBoxX,
            BoundingBoxY = version?.BoundingBoxY,
            BoundingBoxZ = version?.BoundingBoxZ,
            AnimationCount = version?.AnimationCount,
            AnimationNames = version?.AnimationNames ?? new List<string>(),
            BoneCount = version?.BoneCount,
            Animations = animationMetadata?.Animations ?? Array.Empty<ModelAnimationDto>(),
            ShapeKeys = animationMetadata?.ShapeKeys ?? Array.Empty<ModelShapeKeysDto>(),
            UpdatedAt = version?.TechnicalDetailsUpdatedAt
        };
    }
}

public record ModelConceptImageDto
{
    public int FileId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string PreviewUrl { get; init; } = string.Empty;
    public string FileUrl { get; init; } = string.Empty;
    public string MimeType { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

public record ModelCategorySummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int? ParentId { get; init; }
    public string Path { get; init; } = string.Empty;
}

public record ModelTechnicalMetadataDto
{
    public int? LatestVersionId { get; init; }
    public int? LatestVersionNumber { get; init; }
    public int? TriangleCount { get; init; }
    public int? VertexCount { get; init; }
    public int? MeshCount { get; init; }
    public int? MaterialCount { get; init; }
    public double? BoundingBoxX { get; init; }
    public double? BoundingBoxY { get; init; }
    public double? BoundingBoxZ { get; init; }
    public int? AnimationCount { get; init; }
    public IReadOnlyList<string> AnimationNames { get; init; } = Array.Empty<string>();
    public int? BoneCount { get; init; }

    /// <summary>
    /// Per-clip detail from the raw extraction payload: `{name, durationSeconds, kinds}`,
    /// where kinds is any of skeletal / morph / material. Empty for assets whose
    /// extraction predates clip kinds or that carry no clips.
    /// </summary>
    public IReadOnlyList<ModelAnimationDto> Animations { get; init; } = Array.Empty<ModelAnimationDto>();

    /// <summary>
    /// Per-mesh shape-key names from the raw extraction payload: `{meshName, names}`.
    /// Empty for assets with no morph targets.
    /// </summary>
    public IReadOnlyList<ModelShapeKeysDto> ShapeKeys { get; init; } = Array.Empty<ModelShapeKeysDto>();

    public DateTime? UpdatedAt { get; init; }
}

/// <summary>
/// One extracted animation clip, as stored in the raw payload and returned on
/// the model DTO and the MCP reads: `{name, durationSeconds, kinds}`.
/// </summary>
public sealed record ModelAnimationDto
{
    public string Name { get; init; } = string.Empty;
    public double DurationSeconds { get; init; }

    /// <summary>Any of skeletal / morph / material, in that canonical order.</summary>
    public IReadOnlyList<string> Kinds { get; init; } = Array.Empty<string>();
}

/// <summary>
/// One mesh's shape keys, as returned to callers: `{meshName, names}`.
/// </summary>
public sealed record ModelShapeKeysDto
{
    public string MeshName { get; init; } = string.Empty;
    public IReadOnlyList<string> Names { get; init; } = Array.Empty<string>();
}

/// <summary>
/// The worker's shape-key input, matching the stored payload shape:
/// `{meshName, shapeKeys}`. Mapped to <see cref="ModelShapeKeysDto"/> on read.
/// </summary>
public sealed record ModelShapeKeysInput
{
    public string MeshName { get; init; } = string.Empty;
    public IReadOnlyList<string> ShapeKeys { get; init; } = Array.Empty<string>();
}