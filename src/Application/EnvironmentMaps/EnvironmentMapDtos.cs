namespace Application.EnvironmentMaps;

public record EnvironmentMapVariantDto(
    int Id,
    string SizeLabel,
    int FileId,
    string FileName,
    long FileSizeBytes,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool IsDeleted,
    string PreviewUrl,
    string FileUrl);

public record EnvironmentMapListDto(
    int Id,
    string Name,
    int VariantCount,
    int? PreviewVariantId,
    int? PreviewFileId,
    string? PreviewUrl,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record EnvironmentMapDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int VariantCount { get; init; }
    public int? PreviewVariantId { get; init; }
    public int? PreviewFileId { get; init; }
    public string? PreviewUrl { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public ICollection<EnvironmentMapVariantDto> Variants { get; init; } = new List<EnvironmentMapVariantDto>();
    public ICollection<EnvironmentMapPackDto> Packs { get; init; } = new List<EnvironmentMapPackDto>();
    public ICollection<EnvironmentMapProjectDto> Projects { get; init; } = new List<EnvironmentMapProjectDto>();
}

public record EnvironmentMapPackDto(int Id, string Name);
public record EnvironmentMapProjectDto(int Id, string Name);
