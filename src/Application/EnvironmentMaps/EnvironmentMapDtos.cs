using Application.Models;
using Application.EnvironmentMapCategories;
using Domain.Models;
using Domain.ValueObjects;
using DomainFile = Domain.Models.File;

namespace Application.EnvironmentMaps;

public record EnvironmentMapFileDto(
    int FileId,
    string FileName,
    long FileSizeBytes,
    string PreviewUrl,
    string FileUrl);

public record EnvironmentMapCubeFacesDto(
    EnvironmentMapFileDto Px,
    EnvironmentMapFileDto Nx,
    EnvironmentMapFileDto Py,
    EnvironmentMapFileDto Ny,
    EnvironmentMapFileDto Pz,
    EnvironmentMapFileDto Nz);

public record EnvironmentMapVariantDto(
    int Id,
    string SizeLabel,
    string SourceType,
    string ProjectionType,
    int? PreviewFileId,
    int? FileId,
    string FileName,
    long FileSizeBytes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool IsDeleted,
    string PreviewUrl,
    string FileUrl,
    EnvironmentMapFileDto? PanoramicFile,
    EnvironmentMapCubeFacesDto? CubeFaces);

public record EnvironmentMapListDto(
    int Id,
    string Name,
    int VariantCount,
    int? PreviewVariantId,
    int? PreviewFileId,
    int? CustomThumbnailFileId,
    int? CategoryId,
    string? CategoryPath,
    string? PreviewSizeLabel,
    ICollection<string> SizeLabels,
    string? PreviewUrl,
    string? CustomThumbnailUrl,
    string SourceType,
    string ProjectionType,
    ICollection<string> SourceTypes,
    ICollection<string> ProjectionTypes,
    ICollection<EnvironmentMapPackDto> Packs,
    ICollection<EnvironmentMapProjectDto> Projects,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record EnvironmentMapDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int VariantCount { get; init; }
    public int? PreviewVariantId { get; init; }
    public int? PreviewFileId { get; init; }
    public int? CustomThumbnailFileId { get; init; }
    public int? CategoryId { get; init; }
    public EnvironmentMapCategorySummaryDto? Category { get; init; }
    public string? PreviewUrl { get; init; }
    public string? CustomThumbnailUrl { get; init; }
    public string SourceType { get; init; } = "single";
    public string ProjectionType { get; init; } = "equirectangular";
    public ICollection<string> SizeLabels { get; init; } = new List<string>();
    public ICollection<string> SourceTypes { get; init; } = new List<string>();
    public ICollection<string> ProjectionTypes { get; init; } = new List<string>();
    public EnvironmentMapFileDto? PanoramicFile { get; init; }
    public EnvironmentMapCubeFacesDto? CubeFaces { get; init; }
    public ICollection<string> Tags { get; init; } = new List<string>();
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public ICollection<EnvironmentMapVariantDto> Variants { get; init; } = new List<EnvironmentMapVariantDto>();
    public ICollection<EnvironmentMapPackDto> Packs { get; init; } = new List<EnvironmentMapPackDto>();
    public ICollection<EnvironmentMapProjectDto> Projects { get; init; } = new List<EnvironmentMapProjectDto>();
}

public record EnvironmentMapPackDto(int Id, string Name);
public record EnvironmentMapProjectDto(int Id, string Name);

internal static class EnvironmentMapDtoMappings
{
    internal static EnvironmentMapListDto MapListDto(EnvironmentMap environmentMap)
    {
        var activeVariants = environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .OrderByDescending(v => EnvironmentMapSizeLabel.GetSortScore(v.SizeLabel))
            .ToList();
        var previewVariant = environmentMap.GetPreviewVariant();
        var previewFile = environmentMap.CustomThumbnailFile ?? previewVariant?.GetPreviewFile();
        var sourceVariant = previewVariant ?? activeVariants.FirstOrDefault();
        var sizeLabels = activeVariants
            .Select(v => v.SizeLabel)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var sourceTypes = activeVariants
            .Select(MapSourceType)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var projectionTypes = activeVariants
            .Select(MapProjectionType)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new EnvironmentMapListDto(
            environmentMap.Id,
            environmentMap.Name,
            environmentMap.VariantCount,
            environmentMap.PreviewVariantId,
            previewVariant?.GetPreviewFile()?.Id,
            environmentMap.CustomThumbnailFileId,
            environmentMap.EnvironmentMapCategoryId,
            EnvironmentMapCategoryMappings.BuildPath(environmentMap.EnvironmentMapCategory),
            sourceVariant?.SizeLabel,
            sizeLabels,
            previewVariant != null || environmentMap.CustomThumbnailFileId.HasValue ? BuildEnvironmentMapPreviewUrl(environmentMap) : null,
            environmentMap.CustomThumbnailFileId.HasValue ? $"/files/{environmentMap.CustomThumbnailFileId.Value}/preview?channel=rgb" : null,
            MapSourceType(sourceVariant),
            MapProjectionType(sourceVariant),
            sourceTypes,
            projectionTypes,
            environmentMap.Packs
                .Select(p => new EnvironmentMapPackDto(p.Id, p.Name))
                .ToList(),
            environmentMap.Projects
                .Select(p => new EnvironmentMapProjectDto(p.Id, p.Name))
                .ToList(),
            environmentMap.CreatedAt,
            environmentMap.UpdatedAt);
    }

    internal static EnvironmentMapDetailDto MapDetailDto(EnvironmentMap environmentMap)
    {
        var activeVariants = environmentMap.Variants
            .Where(v => !v.IsDeleted)
            .OrderByDescending(v => EnvironmentMapSizeLabel.GetSortScore(v.SizeLabel))
            .ToList();
        var previewVariant = environmentMap.GetPreviewVariant();
        var previewFile = environmentMap.CustomThumbnailFile ?? previewVariant?.GetPreviewFile();
        var sourceVariant = previewVariant ?? activeVariants.FirstOrDefault();

        return new EnvironmentMapDetailDto
        {
            Id = environmentMap.Id,
            Name = environmentMap.Name,
            VariantCount = environmentMap.VariantCount,
            PreviewVariantId = environmentMap.PreviewVariantId,
            PreviewFileId = previewVariant?.GetPreviewFile()?.Id,
            CustomThumbnailFileId = environmentMap.CustomThumbnailFileId,
            CategoryId = environmentMap.EnvironmentMapCategoryId,
            Category = MapCategoryDto(environmentMap.EnvironmentMapCategory),
            PreviewUrl = previewVariant != null || environmentMap.CustomThumbnailFileId.HasValue ? BuildEnvironmentMapPreviewUrl(environmentMap) : null,
            CustomThumbnailUrl = environmentMap.CustomThumbnailFileId.HasValue ? $"/files/{environmentMap.CustomThumbnailFileId.Value}/preview?channel=rgb" : null,
            SourceType = MapSourceType(sourceVariant),
            ProjectionType = MapProjectionType(sourceVariant),
            SizeLabels = activeVariants
                .Select(v => v.SizeLabel)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            SourceTypes = activeVariants
                .Select(MapSourceType)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            ProjectionTypes = activeVariants
                .Select(MapProjectionType)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            PanoramicFile = sourceVariant?.IsPanoramic == true && sourceVariant.File != null ? MapFileDto(sourceVariant.File) : null,
            CubeFaces = sourceVariant?.IsCube == true ? MapCubeFacesDto(sourceVariant) : null,
            Tags = environmentMap.Tags
                .Select(tag => tag.Name)
                .OrderBy(tag => tag)
                .ToList(),
            CreatedAt = environmentMap.CreatedAt,
            UpdatedAt = environmentMap.UpdatedAt,
            Variants = activeVariants
                .Select(v => MapVariantDto(environmentMap, v))
                .ToList(),
            Packs = environmentMap.Packs
                .Select(p => new EnvironmentMapPackDto(p.Id, p.Name))
                .ToList(),
            Projects = environmentMap.Projects
                .Select(p => new EnvironmentMapProjectDto(p.Id, p.Name))
                .ToList()
        };
    }

    internal static EnvironmentMapVariantDto MapVariantDto(EnvironmentMap environmentMap, EnvironmentMapVariant variant)
    {
        var panoramicFile = variant.IsPanoramic && variant.File != null ? MapFileDto(variant.File) : null;
        var cubeFaces = variant.IsCube ? MapCubeFacesDto(variant) : null;
        var fileId = variant.IsPanoramic ? variant.File?.Id : null;
        var fileName = variant.IsPanoramic
            ? variant.File?.OriginalFileName ?? string.Empty
            : "Cube map";
        var fileSizeBytes = variant.IsPanoramic
            ? variant.File?.SizeBytes ?? 0
            : variant.FaceFiles.Sum(faceFile => faceFile.File.SizeBytes);
        var fileUrl = variant.IsPanoramic && variant.File != null
            ? $"/files/{variant.File.Id}"
            : string.Empty;

        return new EnvironmentMapVariantDto(
            variant.Id,
            variant.SizeLabel,
            MapSourceType(variant),
            MapProjectionType(variant),
            variant.GetPreviewFile()?.Id,
            fileId,
            fileName,
            fileSizeBytes,
            variant.CreatedAt,
            variant.UpdatedAt,
            variant.IsDeleted,
            BuildVariantPreviewUrl(environmentMap, variant),
            fileUrl,
            panoramicFile,
            cubeFaces);
    }

    private static EnvironmentMapCubeFacesDto MapCubeFacesDto(EnvironmentMapVariant variant)
    {
        return new EnvironmentMapCubeFacesDto(
            MapFaceDto(variant, EnvironmentMapCubeFace.Px),
            MapFaceDto(variant, EnvironmentMapCubeFace.Nx),
            MapFaceDto(variant, EnvironmentMapCubeFace.Py),
            MapFaceDto(variant, EnvironmentMapCubeFace.Ny),
            MapFaceDto(variant, EnvironmentMapCubeFace.Pz),
            MapFaceDto(variant, EnvironmentMapCubeFace.Nz));
    }

    private static EnvironmentMapFileDto MapFaceDto(EnvironmentMapVariant variant, EnvironmentMapCubeFace face)
    {
        var file = variant.GetFaceFile(face)
            ?? throw new InvalidOperationException($"Cube variant {variant.Id} is missing the {face} face.");

        return MapFileDto(file);
    }

    private static EnvironmentMapFileDto MapFileDto(DomainFile file)
        => new(
            file.Id,
            file.OriginalFileName,
            file.SizeBytes,
            $"/files/{file.Id}/preview?channel=rgb",
            $"/files/{file.Id}");

    private static string MapSourceType(EnvironmentMapVariant? variant)
        => variant?.IsCube == true ? "cube" : "single";

    private static string MapProjectionType(EnvironmentMapVariant? variant)
        => variant?.IsCube == true ? "cube" : "equirectangular";

    private static EnvironmentMapCategorySummaryDto? MapCategoryDto(EnvironmentMapCategory? category)
    {
        if (category == null)
            return null;

        return new EnvironmentMapCategorySummaryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ParentId = category.ParentId,
            Path = EnvironmentMapCategoryMappings.BuildPath(category) ?? category.Name
        };
    }

    private static string BuildEnvironmentMapPreviewUrl(EnvironmentMap environmentMap)
        => $"/environment-maps/{environmentMap.Id}/preview?v={environmentMap.UpdatedAt.Ticks}";

    private static string BuildVariantPreviewUrl(EnvironmentMap environmentMap, EnvironmentMapVariant variant)
        => $"/environment-maps/{environmentMap.Id}/variants/{variant.Id}/preview?v={environmentMap.UpdatedAt.Ticks}";
}
