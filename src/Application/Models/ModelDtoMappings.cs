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

    public static ModelTechnicalMetadataDto ToTechnicalMetadataDto(ModelVersion? version)
    {
        return new ModelTechnicalMetadataDto
        {
            LatestVersionId = version?.Id,
            LatestVersionNumber = version?.VersionNumber,
            TriangleCount = version?.TriangleCount,
            VertexCount = version?.VertexCount,
            MeshCount = version?.MeshCount,
            MaterialCount = version?.MaterialCount,
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
    public DateTime? UpdatedAt { get; init; }
}